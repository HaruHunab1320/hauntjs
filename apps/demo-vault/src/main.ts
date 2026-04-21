import { join } from "node:path";
import { deserializeBeing, metabolize, serializeBeing } from "@embersjs/core";
import type { ResidentState } from "@hauntjs/core";
import { applyPhaseTransition, Runtime, TickScheduler, TimeSystem } from "@hauntjs/core";
import {
  GuestTrustTracker,
  kovacsConfig,
  liraConfig,
  marshConfig,
  poeVault,
  poeVaultBeing,
  ravenConfig,
  TranscriptLogger,
  VAULT_CONFIG,
  VAULT_PHASE_TRANSITIONS,
} from "@hauntjs/demo-vault";
import { GuestAgent, ModelCallQueue } from "@hauntjs/guest-agent";
import { Place2DAdapter } from "@hauntjs/place-2d";
import { createModelProvider, Resident, SqliteMemoryStore } from "@hauntjs/resident";
import Fastify from "fastify";

// --- Configuration ---

const WS_PORT = Number(process.env.WS_PORT ?? 4002);
const HTTP_PORT = Number(process.env.PORT ?? 4333);
const TICK_INTERVAL_MS = Number(process.env.TICK_INTERVAL ?? 60 * 1000); // 60s ticks
const TIME_MS_PER_HOUR = Number(process.env.TIME_MS_PER_HOUR ?? 600000); // 10 min = 1 in-world hour

// Model tiers
const RICH_MODEL = process.env.HAUNT_RICH_MODEL ?? "gemini-3-flash-preview";
const FAST_MODEL = process.env.HAUNT_FAST_MODEL ?? "gemini-3-flash-preview";

// Guest arrival delays (real ms after start)
const GUEST_ARRIVAL_SCHEDULE = [
  { config: marshConfig, delayMs: 3 * 60 * 1000 }, // Marsh: 3 min
  { config: kovacsConfig, delayMs: 6 * 60 * 1000 }, // Kovacs: 6 min
  { config: liraConfig, delayMs: 10 * 60 * 1000 }, // Lira: 10 min
  { config: ravenConfig, delayMs: 15 * 60 * 1000 }, // Raven: 15 min (fashionably late)
];

// The secret Poe guards
const THE_SECRET = `The Vault was built by the Kovacs family in 1847. The newer painting in the gallery is of Elena Kovacs, the last family member to live here. Before she left, she entrusted the keeper with a single instruction: "When one of ours returns — and you'll know them by their patience, not their name — tell them the vault beneath the archive holds the family records. The combination is the year the fountain was built." The fountain was built in 1923.`;

async function start(): Promise<void> {
  console.log("\n  ╔═══════════════════════════════╗");
  console.log("  ║     THE VAULT — Haunt Demo    ║");
  console.log("  ╚═══════════════════════════════╝\n");

  // 1. Create the place
  const adapter = new Place2DAdapter({
    ...VAULT_CONFIG,
    port: WS_PORT,
  });
  const place = await adapter.mount();

  // 2. Set up memory
  const dataDir = join(process.cwd(), "data");
  await import("node:fs").then((fs) => fs.mkdirSync(dataDir, { recursive: true }));
  const memory = new SqliteMemoryStore({ dbPath: join(dataDir, "the-vault.db") });

  // 3. Restore or create Poe's Being
  const savedBeing = memory.loadBeing("poe-vault");
  const being = savedBeing ? deserializeBeing(savedBeing as never) : poeVaultBeing;
  console.log(`  Being: ${savedBeing ? "restored" : "fresh"}`);

  // 4. Create resident state
  const residentState: ResidentState = {
    id: "poe-vault",
    character: poeVault,
    presenceMode: "host",
    currentRoom: VAULT_CONFIG.residentStartRoom,
    focusRoom: null,
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

  // Poe gets the rich model at highest priority
  const poeModel = queue.wrap(richProvider, 0);
  // Guests get the fast model at lower priority
  const guestModel = queue.wrap(fastProvider, 2);

  console.log(`  Rich model: ${RICH_MODEL}`);
  console.log(`  Fast model: ${FAST_MODEL}`);

  // 6. Create Poe's mind
  const residentMind = new Resident({
    character: poeVault,
    model: poeModel,
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

  // 9. Set up trust tracking and transcript
  const trustTracker = new GuestTrustTracker(THE_SECRET);
  const transcript = new TranscriptLogger();
  transcript.setTimeSource(() => timeSystem.time);

  // 10. Wire event bus
  runtime.eventBus.on("*", async (event) => {
    // Log everything
    transcript.log(event);

    // Track trust
    trustTracker.processEvent(event);

    // Apply phase transitions
    if (event.type === "time.phaseChanged") {
      applyPhaseTransition(place, event.to as never, VAULT_PHASE_TRANSITIONS);
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
      memory.saveBeing("poe-vault", serializeBeing(residentState.being as never));
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
            name: poeVault.name,
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
          },
          guests: Array.from(place.guests.values())
            .filter((g) => g.currentRoom !== null)
            .map((g) => ({
              id: g.id as string,
              name: g.name,
              currentRoom: g.currentRoom as string | null,
              trustWithResident: trustTracker.getTrust(g.id),
            })),
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
  });

  // 11. Process time on every tick
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

    // Decay trust for inactive guests
    const activeGuests = new Set(
      Array.from(place.guests.values())
        .filter((g) => g.currentRoom !== null)
        .map((g) => g.id as string),
    );
    trustTracker.decayTrust(activeGuests);
  });

  // 12. Start everything
  await runtime.start();

  const tickScheduler = new TickScheduler(runtime, {
    intervalMs: TICK_INTERVAL_MS,
    tickWhenEmpty: true, // Poe should act even when alone
  });
  tickScheduler.start();

  await adapter.start(runtime);

  // 13. HTTP health + telemetry endpoint
  const server = Fastify({ logger: false, forceCloseConnections: true });

  server.get("/", async () => ({
    name: "the-vault",
    status: "running",
    time: timeSystem.time,
    trust: trustTracker.getAllTrust(),
    queue: { pending: queue.pending, active: queue.active },
  }));

  await server.listen({ port: HTTP_PORT, host: "0.0.0.0" });

  console.log(`  Time:      ${TIME_MS_PER_HOUR / 1000}s per in-world hour`);
  console.log(`  Tick:      every ${TICK_INTERVAL_MS / 1000}s`);
  console.log(`  HTTP:      http://localhost:${HTTP_PORT}`);
  console.log(`  WebSocket: ws://localhost:${WS_PORT}`);
  console.log(`\n  Dawn breaks over The Vault...\n`);

  // 14. Stagger guest arrivals
  const agents: GuestAgent[] = [];
  for (const { config, delayMs } of GUEST_ARRIVAL_SCHEDULE) {
    setTimeout(async () => {
      try {
        const agent = new GuestAgent(config, runtime, guestModel);
        agents.push(agent);
        await agent.start();
        console.log(`\n  ► ${config.name} arrives at The Vault.\n`);
      } catch (err) {
        console.error(`  Failed to start ${config.name}:`, err);
      }
    }, delayMs);
  }

  // 15. Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n  Closing The Vault (${signal})...`);
    tickScheduler.stop();
    for (const agent of agents) {
      await agent.stop();
    }
    await adapter.stop();
    await runtime.stop();
    if (residentState.being) {
      memory.saveBeing("poe-vault", serializeBeing(residentState.being as never));
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
