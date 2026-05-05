import { join } from "node:path";
import { deserializeBeing, metabolize, serializeBeing } from "@embersjs/core";
import type { ResidentState } from "@hauntjs/core";
import { applyPhaseTransition, Runtime, TickScheduler, TimeSystem } from "@hauntjs/core";
import {
  home,
  homeBeing,
  kitConfig,
  orenConfig,
  RESIDENCY_CONFIG,
  RESIDENCY_PHASE_TRANSITIONS,
  rhoConfig,
  sableConfig,
} from "@hauntjs/demo-residency";
import { TranscriptLogger } from "@hauntjs/demo-vault";
import { GuestAgent, ModelCallQueue } from "@hauntjs/guest-agent";
import { Place2DAdapter } from "@hauntjs/place-2d";
import { createModelProvider, Resident, SqliteMemoryStore } from "@hauntjs/resident";
import Fastify from "fastify";

// --- Configuration ---

const WS_PORT = Number(process.env.WS_PORT ?? 4004);
const HTTP_PORT = Number(process.env.PORT ?? 4335);
const TICK_INTERVAL_MS = Number(process.env.TICK_INTERVAL ?? 60 * 1000); // 60s ticks
const TIME_MS_PER_HOUR = Number(process.env.TIME_MS_PER_HOUR ?? 600000); // 10 min = 1 in-world hour

// Model tiers
const RICH_MODEL = process.env.HAUNT_RICH_MODEL ?? "gemini-3.1-pro-preview";
const FAST_MODEL = process.env.HAUNT_FAST_MODEL ?? "gemini-3-flash-preview";

// Simulation limits
const MAX_IN_WORLD_DAYS = Number(process.env.MAX_DAYS ?? 3); // Stop after N in-world days
const MAX_REAL_MINUTES = Number(process.env.MAX_REAL_MINUTES ?? 0); // 0 = no real-time limit

// Guest arrival delays (real ms after start) — shorter intervals since they all "live" here
const GUEST_ARRIVAL_SCHEDULE = [
  { config: sableConfig, delayMs: 1 * 60 * 1000 }, // Sable: 1 min
  { config: orenConfig, delayMs: 2 * 60 * 1000 }, // Oren: 2 min
  { config: kitConfig, delayMs: 3 * 60 * 1000 }, // Kit: 3 min
  { config: rhoConfig, delayMs: 4 * 60 * 1000 }, // Rho: 4 min
];

async function start(): Promise<void> {
  console.log("\n  ╔═══════════════════════════════════╗");
  console.log("  ║   THE RESIDENCY — Haunt Demo      ║");
  console.log("  ╚═══════════════════════════════════╝\n");

  // 1. Create the place
  const adapter = new Place2DAdapter({
    ...RESIDENCY_CONFIG,
    port: WS_PORT,
  });
  const place = await adapter.mount();

  // 2. Set up memory
  const dataDir = join(process.cwd(), "data");
  await import("node:fs").then((fs) => fs.mkdirSync(dataDir, { recursive: true }));
  const memory = new SqliteMemoryStore({ dbPath: join(dataDir, "the-residency.db") });

  // 3. Restore or create Home's Being
  const savedBeing = memory.loadBeing("home-residency");
  const being = savedBeing ? deserializeBeing(savedBeing as never) : homeBeing;
  console.log(`  Being: ${savedBeing ? "restored" : "fresh"}`);

  // 4. Create resident state
  const residentState: ResidentState = {
    id: "home-residency",
    character: home,
    presenceMode: "host",
    currentRoom: RESIDENCY_CONFIG.residentStartRoom,
    focusRoom: RESIDENCY_CONFIG.residentStartRoom,
    mood: { energy: 0.8, focus: 0.7, valence: 0.5 },
    being,
  };

  // 5. Set up model providers through a shared queue
  const queue = new ModelCallQueue({ maxConcurrent: 3, minDelayMs: 300 });
  const richProvider = createModelProvider({
    provider: "gemini",
    model: RICH_MODEL,
  });
  const fastProvider = createModelProvider({
    provider: "gemini",
    model: FAST_MODEL,
  });

  // Home gets the rich model at highest priority
  const homeModel = queue.wrap(richProvider, 0);
  // Guests get the fast model at lower priority
  const guestModel = queue.wrap(fastProvider, 2);

  console.log(`  Rich model: ${RICH_MODEL}`);
  console.log(`  Fast model: ${FAST_MODEL}`);

  // 6. Create Home's mind
  const residentMind = new Resident({
    character: home,
    model: homeModel,
    memory,
  });

  // 7. Create the time system
  const timeSystem = new TimeSystem({
    realMsPerInWorldHour: TIME_MS_PER_HOUR,
    startHour: 6, // Dawn
  });

  // 8. Create the runtime
  const runtime = new Runtime({
    place,
    resident: residentState,
    residentMind,
  });

  // 9. Set up transcript
  const transcript = new TranscriptLogger(memory.getDb());
  transcript.setTimeSource(() => timeSystem.time);

  // 10. Wire event bus
  let telemetryTickCount = 0;

  runtime.eventBus.on("*", async (event) => {
    // Log everything
    transcript.log(event);

    // Apply phase transitions and evict stranded guests
    if (event.type === "time.phaseChanged") {
      const evictions = applyPhaseTransition(place, event.to as never, RESIDENCY_PHASE_TRANSITIONS);
      for (const eviction of evictions) {
        await runtime.emit({
          type: "guest.moved",
          guestId: eviction.guestId,
          from: eviction.from,
          to: eviction.to,
          at: new Date(),
        });
      }
    }

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

    // Persist Being on tick
    if (event.type === "tick" && residentState.being) {
      memory.saveBeing("home-residency", serializeBeing(residentState.being as never));
    }

    // Broadcast ALL events to spectators (omniscient observer)
    if (adapter.getServer() && event.type !== "tick") {
      adapter.getServer()!.broadcastToSpectators(eventToServerMessage(event));
    }

    // Broadcast telemetry snapshot to spectators
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
            name: home.name,
            focusRoom: residentState.focusRoom as string | null,
            orientation: metabolized?.orientation ?? null,
            felt: metabolized?.felt ?? null,
            lastAction: event.type.startsWith("resident.") ? event.type : null,
            drives:
              metabolized?.dominantDrives?.map(
                (d: { id: string; name: string; level: number; feltPressure: number }) => ({
                  id: d.id,
                  name: d.name,
                  level: d.level,
                  pressure: d.feltPressure,
                }),
              ) ?? [],
            practices:
              metabolized?.practiceState?.map(
                (p: { id: string; name: string; depth: number; active: boolean }) => ({
                  id: p.id,
                  name: p.name,
                  depth: p.depth,
                  active: p.active,
                }),
              ) ?? [],
          },
          guests: Array.from(place.guests.values())
            .filter((g) => g.currentRoom !== null)
            .map((g) => {
              // Find the matching agent to access its Being
              const agent = agents.find((a) => a.id === g.id);
              const guestBeing = agent?.config.being;
              let guestMetabolized: ReturnType<typeof metabolize> | null = null;
              if (guestBeing) {
                try {
                  guestMetabolized = metabolize(guestBeing as never);
                } catch {
                  // Being may not be ready yet
                }
              }
              return {
                id: g.id as string,
                name: g.name,
                currentRoom: g.currentRoom as string | null,
                drives:
                  guestMetabolized?.dominantDrives?.map(
                    (d: { id: string; name: string; level: number; feltPressure: number }) => ({
                      id: d.id,
                      name: d.name,
                      level: d.level,
                      pressure: d.feltPressure,
                    }),
                  ) ?? [],
                practices:
                  guestMetabolized?.practiceState?.map(
                    (p: { id: string; name: string; depth: number; active: boolean }) => ({
                      id: p.id,
                      name: p.name,
                      depth: p.depth,
                      active: p.active,
                    }),
                  ) ?? [],
              };
            }),
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

    // Persist drive/practice snapshots to DB every 5 ticks
    if (event.type === "tick") {
      telemetryTickCount++;
      if (telemetryTickCount % 5 === 0) {
        const snapshotAgents: Array<{
          id: string;
          name: string;
          drives: Array<{ id: string; name: string; level: number; pressure: number }>;
          practices: Array<{ id: string; name: string; depth: number; active: boolean }>;
        }> = [];

        // Resident snapshot
        if (residentState.being) {
          try {
            const resMeta = metabolize(residentState.being as never);
            snapshotAgents.push({
              id: residentState.id,
              name: home.name,
              drives: resMeta.dominantDrives.map(
                (d: { id: string; name: string; level: number; feltPressure: number }) => ({
                  id: d.id, name: d.name, level: d.level, pressure: d.feltPressure,
                }),
              ),
              practices: resMeta.practiceState.map(
                (p: { id: string; name: string; depth: number; active: boolean }) => ({
                  id: p.id, name: p.name, depth: p.depth, active: p.active,
                }),
              ),
            });
          } catch { /* skip if metabolize fails */ }
        }

        // Guest snapshots
        for (const agent of agents) {
          const guestBeing = agent.config.being;
          if (!guestBeing) continue;
          try {
            const gMeta = metabolize(guestBeing as never);
            snapshotAgents.push({
              id: agent.id as string,
              name: agent.name,
              drives: gMeta.dominantDrives.map(
                (d: { id: string; name: string; level: number; feltPressure: number }) => ({
                  id: d.id, name: d.name, level: d.level, pressure: d.feltPressure,
                }),
              ),
              practices: gMeta.practiceState.map(
                (p: { id: string; name: string; depth: number; active: boolean }) => ({
                  id: p.id, name: p.name, depth: p.depth, active: p.active,
                }),
              ),
            });
          } catch { /* skip if metabolize fails */ }
        }

        if (snapshotAgents.length > 0) {
          const db = memory.getDb();
          if (db) {
            const stmt = db.prepare(
              "INSERT INTO events_log (event_type, payload_json, created_at) VALUES (?, ?, ?)",
            );
            stmt.run(
              "telemetry.snapshot",
              JSON.stringify({
                tick: telemetryTickCount,
                time: timeSystem.time,
                agents: snapshotAgents,
              }),
              new Date().toISOString(),
            );
          }
        }
      }
    }
  });

  // 11. Process time on every tick
  const startTime = Date.now();

  runtime.eventBus.on("tick", async () => {
    // Update time system
    const fakeState = {
      event: { type: "tick", at: new Date() },
      perceptions: [],
      shouldDeliberate: false,
      actions: [],
      actionResults: [],
    };
    await timeSystem.run(fakeState as never, {} as never);

    // Check for pending phase change event
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
      console.log(`\n  ⏹ Simulation ended: ${Math.round(realMinutes)} real minutes elapsed (limit: ${MAX_REAL_MINUTES})`);
      await shutdown("max-time");
    }
  });

  // 12. Start everything
  await runtime.start();

  const tickScheduler = new TickScheduler(runtime, {
    intervalMs: TICK_INTERVAL_MS,
    tickWhenEmpty: true, // Home should act even when alone
  });
  tickScheduler.start();

  await adapter.start(runtime);

  // 13. HTTP health + telemetry endpoint
  const server = Fastify({ logger: false, forceCloseConnections: true });

  server.get("/", async () => ({
    name: "the-residency",
    status: "running",
    time: timeSystem.time,
    queue: { pending: queue.pending, active: queue.active },
  }));

  await server.listen({ port: HTTP_PORT, host: "0.0.0.0" });

  console.log(`  Time:      ${TIME_MS_PER_HOUR / 1000}s per in-world hour`);
  console.log(`  Tick:      every ${TICK_INTERVAL_MS / 1000}s`);
  console.log(`  HTTP:      http://localhost:${HTTP_PORT}`);
  console.log(`  WebSocket: ws://localhost:${WS_PORT}`);
  console.log(`\n  Morning light fills The Residency...\n`);

  // 14. Stagger guest arrivals
  const agents: GuestAgent[] = [];
  for (const { config, delayMs } of GUEST_ARRIVAL_SCHEDULE) {
    setTimeout(async () => {
      try {
        const agent = new GuestAgent(config, runtime, guestModel);
        agents.push(agent);
        await agent.start();
        console.log(`\n  ► ${config.name} wakes up at The Residency.\n`);
      } catch (err) {
        console.error(`  Failed to start ${config.name}:`, err);
      }
    }, delayMs);
  }

  // 15. Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n  Closing The Residency (${signal})...`);
    tickScheduler.stop();
    for (const agent of agents) {
      await agent.stop();
    }
    await adapter.stop();
    await runtime.stop();
    if (residentState.being) {
      memory.saveBeing("home-residency", serializeBeing(residentState.being as never));
      console.log("  Being persisted.");
    }

    // Log final simulation summary as an event
    transcript.log({
      type: "tick" as never,
      at: new Date(),
      _meta: {
        simulationEnd: true,
        signal,
        time: timeSystem.time,
        transcriptLength: transcript.getTranscript().length,
      },
    } as never);

    memory.close();
    await server.close();
    console.log(`  Transcript: ${transcript.getTranscript().length} entries.`);
    console.log(`  Run: tsx scripts/export-transcript.ts --stats  to review\n`);
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGUSR2", () => shutdown("SIGUSR2"));
}

/** Convert a PresenceEvent to a ServerMessage for spectator broadcast. */
function eventToServerMessage(
  event: import("@hauntjs/core").PresenceEvent,
): import("@hauntjs/place-2d").ServerMessage {
  switch (event.type) {
    case "guest.entered":
      return {
        type: "guest.entered",
        guestId: event.guestId as string,
        guestName: event.guestId as string,
        roomId: event.roomId as string,
      };
    case "guest.left":
      return {
        type: "guest.left",
        guestId: event.guestId as string,
        guestName: event.guestId as string,
        roomId: event.roomId as string,
      };
    case "guest.moved":
      return {
        type: "guest.moved",
        guestId: event.guestId as string,
        guestName: event.guestId as string,
        from: event.from as string,
        to: event.to as string,
      };
    case "guest.spoke":
      return {
        type: "guest.spoke",
        guestId: event.guestId as string,
        guestName: event.guestId as string,
        roomId: event.roomId as string,
        text: event.text,
      };
    case "resident.spoke":
      return {
        type: "resident.spoke",
        text: event.text,
        roomId: event.roomId as string,
      };
    case "resident.moved":
      return {
        type: "resident.moved",
        from: event.from as string,
        to: event.to as string,
      };
    case "resident.acted":
      return {
        type: "resident.acted" as never,
        affordanceId: event.affordanceId as string,
        actionId: event.actionId,
      } as never;
    case "time.phaseChanged":
      return {
        type: "time.phaseChanged",
        from: event.from,
        to: event.to,
        inWorldHour: event.inWorldHour,
        day: event.day,
      };
    default:
      return { type: "error", message: `Unknown event: ${event.type}` };
  }
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
