import Fastify from "fastify";
import { join } from "node:path";
import { Runtime } from "@hauntjs/core";
import type { ResidentState, PresenceEvent, ResidentAction } from "@hauntjs/core";
import { Place2DAdapter, ROOST_CONFIG } from "@hauntjs/place-2d";
import { Resident, SqliteMemoryStore, createModelProvider } from "@hauntjs/resident";
import { poe } from "@hauntjs/demo-roost";

const WS_PORT = Number(process.env.WS_PORT ?? 3002);
const HTTP_PORT = Number(process.env.PORT ?? 3333);
const MODEL_PROVIDER = (process.env.HAUNT_MODEL ?? "gemini") as "anthropic" | "openai" | "ollama" | "gemini";

async function start(): Promise<void> {
  // 1. Create the place adapter
  const adapter = new Place2DAdapter({
    ...ROOST_CONFIG,
    port: WS_PORT,
  });

  // 2. Mount the place
  const place = await adapter.mount();

  // 3. Create the resident state
  const residentState: ResidentState = {
    id: "poe",
    character: poe,
    currentRoom: ROOST_CONFIG.residentStartRoom,
    mood: { energy: 0.8, focus: 0.7, valence: 0.5 },
  };

  // 4. Set up model provider
  const model = createModelProvider({ provider: MODEL_PROVIDER });
  console.log(`  Model provider: ${model.name}`);

  // 5. Set up memory store
  const dataDir = join(process.cwd(), "data");
  await import("node:fs").then((fs) => fs.mkdirSync(dataDir, { recursive: true }));
  const memory = new SqliteMemoryStore({ dbPath: join(dataDir, "the-roost.db") });

  // 6. Create the resident mind
  const residentMind = new Resident({
    character: poe,
    model,
    memory,
  });

  // 7. Create the runtime — wire the mind in after construction
  const throttledMind = createThrottledPerceive(residentMind);
  const runtime = new Runtime({
    place,
    resident: residentState,
    residentMind: throttledMind,
  });

  // 8. Wire action broadcast: when resident acts, push to clients via adapter
  runtime.eventBus.on("*", async (event) => {
    if (event.type === "resident.spoke") {
      await adapter.applyAction(
        { type: "speak", text: event.text, audience: event.audience },
        place,
      );
    } else if (event.type === "resident.moved") {
      await adapter.applyAction(
        { type: "move", toRoom: event.to },
        place,
      );
    } else if (event.type === "resident.acted") {
      await adapter.applyAction(
        { type: "act", affordanceId: event.affordanceId, actionId: event.actionId },
        place,
      );
    }
  });

  await runtime.start();

  // 8. Start the WebSocket server
  await adapter.start(runtime);

  // 9. Start the HTTP server
  const server = Fastify({ logger: true, forceCloseConnections: true });

  server.get("/", async () => {
    return {
      name: "haunt",
      status: "alive",
      version: "0.0.0",
      model: MODEL_PROVIDER,
      wsPort: WS_PORT,
      rooms: Array.from(place.rooms.values()).map((r) => ({
        id: r.id,
        name: r.name,
      })),
    };
  });

  await server.listen({ port: HTTP_PORT, host: "0.0.0.0" });
  console.log(`\n  The Roost is open.`);
  console.log(`  Model:     ${MODEL_PROVIDER} (${model.name})`);
  console.log(`  HTTP:      http://localhost:${HTTP_PORT}`);
  console.log(`  WebSocket: ws://localhost:${WS_PORT}`);
  console.log(`  Client:    Run "pnpm --filter @hauntjs/place-2d dev" and open http://localhost:5173\n`);

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\nClosing The Roost (${signal})...`);
    await adapter.stop();
    await runtime.stop();
    memory.close();
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGUSR2", () => shutdown("SIGUSR2"));
}

/**
 * Wraps the resident's perceive with throttling:
 * - Only calls the model for meaningful events (guest speech, entry, movement)
 * - Skips ticks and affordance changes
 * - Drops events while a model call is in flight (backpressure)
 */
function createThrottledPerceive(residentMind: Resident) {
  let busy = false;

  const MEANINGFUL_EVENTS = new Set([
    "guest.entered",
    "guest.left",
    "guest.spoke",
    "guest.moved",
    "affordance.changed",
  ]);

  return {
    async perceive(
      event: PresenceEvent,
      context: Parameters<Resident["perceive"]>[1],
    ): Promise<ResidentAction | null> {
      if (busy) return null;
      if (!MEANINGFUL_EVENTS.has(event.type)) return null;

      busy = true;
      try {
        console.log(`  [Poe] perceiving: ${event.type}`);
        const action = await residentMind.perceive(event, context);
        if (action) {
          const detail = action.type === "speak" ? ` — "${action.text.slice(0, 80)}"` : "";
          console.log(`  [Poe] action: ${action.type}${detail}`);
        } else {
          console.log(`  [Poe] action: (silence)`);
        }
        return action;
      } catch (err) {
        console.error("  [Poe] model error:", err instanceof Error ? err.message : err);
        return null;
      } finally {
        busy = false;
      }
    },
  };
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
