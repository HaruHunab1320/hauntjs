import Fastify from "fastify";
import { join } from "node:path";
import { Runtime, TickScheduler, addGuest, guestId } from "@hauntjs/core";
import type { ResidentState } from "@hauntjs/core";
import { Place2DAdapter, ROOST_CONFIG } from "@hauntjs/place-2d";
import { Resident, SqliteMemoryStore, createModelProvider } from "@hauntjs/resident";
import { poe } from "@hauntjs/demo-roost";

const WS_PORT = Number(process.env.WS_PORT ?? 3002);
const HTTP_PORT = Number(process.env.PORT ?? 3333);
const MODEL_PROVIDER = (process.env.HAUNT_MODEL ?? "gemini") as "anthropic" | "openai" | "ollama" | "gemini";
const TICK_INTERVAL_MS = Number(process.env.TICK_INTERVAL ?? 90 * 1000); // 90 seconds default in dev

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
    presenceMode: "host",
    currentRoom: ROOST_CONFIG.residentStartRoom,
    focusRoom: null,
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

  // 7. Create the runtime with mind + on-return hook
  const tick = { scheduler: null as TickScheduler | null };

  const runtime = new Runtime({
    place,
    resident: residentState,
    residentMind: residentMind,
    onGuestReturn: (guestId) => {
      const guest = place.guests.get(guestId);
      console.log(`  [Roost] returning guest: ${guest?.name ?? guestId} (visit #${guest?.visitCount})`);
      tick.scheduler?.fireImmediate().catch(() => {});
    },
  });

  // 8. Pre-populate known guests from prior sessions
  const knownGuests = memory.getKnownGuests();
  for (const kg of knownGuests) {
    try {
      addGuest(place, {
        id: guestId(kg.id),
        name: kg.name,
        loyaltyTier: kg.loyaltyTier as "principal" | "regular" | "visitor" | "stranger",
      });
      const guest = place.guests.get(guestId(kg.id));
      if (guest) {
        guest.visitCount = kg.visitCount;
        guest.firstSeen = kg.firstSeen;
        guest.lastSeen = kg.lastSeen;
      }
    } catch {
      // Guest may already exist
    }
  }
  if (knownGuests.length > 0) {
    console.log(`  Loaded ${knownGuests.length} known guest(s) from memory`);
  }

  // 9. Wire event bus: logging, action broadcast, guest persistence
  runtime.eventBus.on("*", async (event) => {
    // Log resident actions
    if (event.type === "resident.spoke") {
      console.log(`  [Poe] spoke: "${event.text.slice(0, 80)}"`);
      await adapter.applyAction(
        { type: "speak", text: event.text, audience: event.audience },
        place,
      );
    } else if (event.type === "resident.moved") {
      console.log(`  [Poe] moved: ${event.from} → ${event.to}`);
      await adapter.applyAction(
        { type: "move", toRoom: event.to },
        place,
      );
    } else if (event.type === "resident.acted") {
      console.log(`  [Poe] acted: ${event.affordanceId}:${event.actionId}`);
      await adapter.applyAction(
        { type: "act", affordanceId: event.affordanceId, actionId: event.actionId },
        place,
      );
    }

    // Send debug snapshot if debug mode is on
    if (process.env.HAUNT_DEBUG === "1" && adapter.getServer()) {
      const sensors: Array<{ id: string; roomId: string; roomName: string; modality: string; name: string; enabled: boolean; fidelity: string; reach: string }> = [];
      for (const room of place.rooms.values()) {
        for (const sensor of room.sensors.values()) {
          sensors.push({
            id: sensor.id as string,
            roomId: room.id as string,
            roomName: room.name,
            modality: sensor.modality,
            name: sensor.name,
            enabled: sensor.enabled,
            fidelity: sensor.fidelity.kind,
            reach: sensor.reach.kind,
          });
        }
      }
      adapter.getServer()!.broadcastToAll({
        type: "debug.snapshot",
        sensors,
        recentPerceptions: [],
      });
    }

    // Persist guest data on leave
    if (event.type === "guest.left") {
      const guest = place.guests.get(event.guestId);
      if (guest) {
        memory.persistGuest(guest.id, guest.name, guest.visitCount, guest.loyaltyTier);
      }
    }
  });

  await runtime.start();

  // 9. Start the tick scheduler
  tick.scheduler = new TickScheduler(runtime, {
    intervalMs: TICK_INTERVAL_MS,
    tickWhenEmpty: false,
  });
  tick.scheduler.start();

  // 10. Start the WebSocket server
  await adapter.start(runtime);

  // 11. Start the HTTP server
  const server = Fastify({ logger: true, forceCloseConnections: true });

  server.get("/", async () => {
    return {
      name: "haunt",
      status: "alive",
      version: "0.0.0",
      model: MODEL_PROVIDER,
      wsPort: WS_PORT,
      tickIntervalMs: TICK_INTERVAL_MS,
      rooms: Array.from(place.rooms.values()).map((r) => ({
        id: r.id,
        name: r.name,
      })),
    };
  });

  await server.listen({ port: HTTP_PORT, host: "0.0.0.0" });
  console.log(`\n  The Roost is open.`);
  console.log(`  Model:     ${MODEL_PROVIDER} (${model.name})`);
  console.log(`  Tick:      every ${TICK_INTERVAL_MS / 1000}s`);
  console.log(`  HTTP:      http://localhost:${HTTP_PORT}`);
  console.log(`  WebSocket: ws://localhost:${WS_PORT}`);
  console.log(`  Client:    Run "pnpm --filter @hauntjs/place-2d dev" and open http://localhost:5173\n`);

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\nClosing The Roost (${signal})...`);
    tick.scheduler?.stop();
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

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
