import { join } from "node:path";
import { deserializeBeing, metabolize, serializeBeing } from "@embersjs/core";
import type { ResidentState } from "@hauntjs/core";
import { Runtime, TickScheduler, TimeSystem } from "@hauntjs/core";
import { TranscriptLogger } from "@hauntjs/demo-vault";
import { solus, solusBeing, VOID_CONFIG } from "@hauntjs/demo-void";
import { Place2DAdapter } from "@hauntjs/place-2d";
import {
  createModelProvider,
  createResidentPipeline,
  Resident,
  SqliteMemoryStore,
} from "@hauntjs/resident";
import Fastify from "fastify";

// --- Configuration ---

const WS_PORT = Number(process.env.WS_PORT ?? 4006);
const HTTP_PORT = Number(process.env.PORT ?? 4337);
const TICK_INTERVAL_MS = Number(process.env.TICK_INTERVAL ?? 45 * 1000); // 45s ticks — slower, contemplative
const TIME_MS_PER_HOUR = Number(process.env.TIME_MS_PER_HOUR ?? 300000); // 5 min = 1 in-world hour (slower pace)

const MODEL = process.env.HAUNT_RICH_MODEL ?? "gemini-3.1-pro-preview";

// Simulation limits
const MAX_IN_WORLD_DAYS = Number(process.env.MAX_DAYS ?? 3);
const MAX_REAL_MINUTES = Number(process.env.MAX_REAL_MINUTES ?? 0);

async function start(): Promise<void> {
  console.log("\n  ╔═══════════════════════════════╗");
  console.log("  ║      THE VOID — Haunt Demo     ║");
  console.log("  ╚═══════════════════════════════╝\n");

  // 1. Create the place
  const adapter = new Place2DAdapter({
    ...VOID_CONFIG,
    port: WS_PORT,
  });
  const place = await adapter.mount();

  // 2. Set up memory
  const dataDir = join(process.cwd(), "data");
  await import("node:fs").then((fs) => fs.mkdirSync(dataDir, { recursive: true }));
  const memory = new SqliteMemoryStore({ dbPath: join(dataDir, "the-void.db") });

  // 3. Restore or create Solus's Being
  const savedBeing = memory.loadBeing("solus");
  const being = savedBeing ? deserializeBeing(savedBeing as never) : solusBeing;
  console.log(`  Being: ${savedBeing ? "restored" : "fresh"}`);

  // 4. Create resident state
  const residentState: ResidentState = {
    id: "solus",
    character: solus,
    presenceMode: "host",
    currentRoom: VOID_CONFIG.residentStartRoom,
    focusRoom: VOID_CONFIG.residentStartRoom,
    mood: { energy: 0.5, focus: 0.6, valence: 0.4 },
    being,
  };

  // 5. Set up model provider — single model, no queue needed (only one mind)
  const provider = createModelProvider({
    provider: "gemini",
    model: MODEL,
  });

  console.log(`  Model: ${MODEL}`);

  // 6. Create Solus's mind
  const residentMind = new Resident({
    character: solus,
    model: provider,
    memory,
  });

  // 7. Create the time system
  const timeSystem = new TimeSystem({
    realMsPerInWorldHour: TIME_MS_PER_HOUR,
    startHour: 6,
  });

  // 8. Create the runtime
  const runtime = new Runtime({
    place,
    resident: residentState,
    residentMind,
    // Commitment-aware autonomy: a resident that is occupied does not
    // deliberate about a passing event.
    systems: createResidentPipeline(),
  });

  // 9. Set up transcript
  const transcript = new TranscriptLogger(memory.getDb());
  transcript.setTimeSource(() => timeSystem.time);

  // 10. Wire event bus
  let telemetryTickCount = 0;

  runtime.eventBus.on("*", async (event) => {
    transcript.log(event);

    // Broadcast resident actions to clients
    if (event.type === "resident.spoke") {
      await adapter.applyAction(
        { type: "speak", text: event.text, audience: event.audience },
        place,
      );
    } else if (event.type === "resident.moved") {
      await adapter.applyAction({ type: "move", toRoom: event.to }, place);
    } else if (event.type === "resident.acted") {
      await adapter.applyAction(
        { type: "act", affordanceId: event.affordanceId, actionId: event.actionId },
        place,
      );
    }

    // Broadcast ALL events to spectators
    if (adapter.getServer() && event.type !== "tick") {
      adapter.getServer()!.broadcastToSpectators({
        ...event,
        type: event.type,
      } as never);
    }

    // Broadcast telemetry
    if (adapter.getServer()) {
      const metabolized = residentState.being
        ? (() => {
            try {
              return metabolize(residentState.being as never);
            } catch {
              return null;
            }
          })()
        : null;

      adapter.getServer()!.broadcastToSpectators({
        type: "telemetry",
        data: {
          time: {
            phase: timeSystem.time.phase,
            inWorldHour: timeSystem.time.inWorldHour,
            day: timeSystem.time.day,
          },
          resident: {
            id: residentState.id,
            name: solus.name,
            focusRoom: residentState.focusRoom as string | null,
            orientation: metabolized?.orientation ?? null,
            felt: metabolized?.felt ?? null,
            lastAction: event.type.startsWith("resident.") ? event.type : null,
            drives:
              metabolized?.drives?.map(
                (d: { id: string; name: string; level: number; pressure: number }) => ({
                  id: d.id,
                  name: d.name,
                  level: d.level,
                  pressure: d.pressure,
                }),
              ) ?? [],
            practices:
              metabolized?.practices?.map(
                (p: { id: string; name: string; depth: number; active: boolean }) => ({
                  id: p.id,
                  name: p.name,
                  depth: p.depth,
                  active: p.active,
                }),
              ) ?? [],
          },
          guests: [], // No guests in the void
          sensors: Array.from(place.rooms.values()).flatMap((room) =>
            Array.from(room.sensors.values()).map((s) => ({
              id: s.id as string,
              roomId: room.id as string,
              roomName: room.name,
              modality: s.modality,
              name: s.name,
              enabled: s.enabled,
              fidelity: s.fidelity.kind,
              reach: s.reach.kind,
            })),
          ),
        },
      });
    }

    // Persist drive snapshots every 5 ticks
    if (event.type === "tick") {
      telemetryTickCount++;
      if (telemetryTickCount % 5 === 0 && residentState.being) {
        try {
          const snap = metabolize(residentState.being as never);
          const db = memory.getDb();
          if (db) {
            db.prepare(
              "INSERT INTO events_log (event_type, payload_json, created_at) VALUES (?, ?, ?)",
            ).run(
              "telemetry.snapshot",
              JSON.stringify({
                tick: telemetryTickCount,
                time: timeSystem.time,
                agents: [
                  {
                    id: residentState.id,
                    name: solus.name,
                    orientation: snap.orientation,
                    felt: snap.felt,
                    drives: snap.drives.map(
                      (d: { id: string; name: string; level: number; pressure: number }) => ({
                        id: d.id,
                        name: d.name,
                        level: d.level,
                        pressure: d.pressure,
                      }),
                    ),
                    practices: snap.practices.map(
                      (p: { id: string; name: string; depth: number; active: boolean }) => ({
                        id: p.id,
                        name: p.name,
                        depth: p.depth,
                        active: p.active,
                      }),
                    ),
                  },
                ],
              }),
              new Date().toISOString(),
            );
          }
        } catch {
          /* skip if metabolize fails */
        }
      }
    }

    // Persist Being on tick
    if (event.type === "tick" && residentState.being) {
      memory.saveBeing("solus", serializeBeing(residentState.being as never));
    }
  });

  // 11. Process time on every tick
  const startTime = Date.now();

  runtime.eventBus.on("tick", async () => {
    const fakeState = {
      event: { type: "tick", at: new Date() },
      perceptions: [],
      shouldDeliberate: false,
      actions: [],
      actionResults: [],
    };
    await timeSystem.run(fakeState as never, {} as never);

    const phaseEvent = timeSystem.consumePendingPhaseEvent();
    if (phaseEvent) {
      await runtime.emit(phaseEvent);
    }

    // Check termination conditions
    const time = timeSystem.time;
    const realMinutes = (Date.now() - startTime) / 60_000;

    if (MAX_IN_WORLD_DAYS > 0 && time.day > MAX_IN_WORLD_DAYS) {
      console.log(`\n  ⏹ Simulation ended: reached day ${time.day} (limit: ${MAX_IN_WORLD_DAYS})`);
      await shutdown("max-days");
    }

    if (MAX_REAL_MINUTES > 0 && realMinutes >= MAX_REAL_MINUTES) {
      console.log(`\n  ⏹ Simulation ended: ${Math.round(realMinutes)} real minutes elapsed`);
      await shutdown("max-time");
    }
  });

  // 12. Start everything
  await runtime.start();

  const tickScheduler = new TickScheduler(runtime, {
    intervalMs: TICK_INTERVAL_MS,
    tickWhenEmpty: true, // Solus acts even when alone — that's the point
  });
  tickScheduler.start();

  await adapter.start(runtime);

  // 13. HTTP health endpoint
  const server = Fastify({ logger: false, forceCloseConnections: true });

  server.get("/", async () => ({
    name: "the-void",
    status: "running",
    time: timeSystem.time,
  }));

  await server.listen({ port: HTTP_PORT, host: "0.0.0.0" });

  console.log(`  Time:      ${TIME_MS_PER_HOUR / 1000}s per in-world hour`);
  console.log(`  Tick:      every ${TICK_INTERVAL_MS / 1000}s`);
  console.log(`  HTTP:      http://localhost:${HTTP_PORT}`);
  console.log(`  WebSocket: ws://localhost:${WS_PORT}`);
  console.log(`\n  Solus sits by the fire. The silence begins.\n`);

  // 14. Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n  The fire dims (${signal})...`);
    tickScheduler.stop();
    await adapter.stop();
    await runtime.stop();
    if (residentState.being) {
      memory.saveBeing("solus", serializeBeing(residentState.being as never));
      console.log("  Being persisted.");
    }
    memory.close();
    await server.close();
    console.log(`  Transcript: ${transcript.getTranscript().length} entries.`);
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
