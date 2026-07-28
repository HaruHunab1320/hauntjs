/**
 * Can @hauntjs/core carry a physically-sensed place?
 *
 * Haunt's sensor pipeline derives Perceptions by *degrading* a known-true
 * PresenceEvent. Physical space runs the other way — the sensor reading is
 * primary and the event is a hypothesis that may never resolve. There is no
 * guestId to withhold, because nothing ever established who it was.
 *
 * This demonstrates that the inversion works with NO changes to @hauntjs/core,
 * by swapping SensorSystem for one that reads a hardware buffer instead of
 * calling filterEvent(). Ticks drive the loop; AutonomySystem lets ticks through
 * unconditionally, so the resident deliberates on sensor data alone.
 *
 * Two things are actually under test, and neither is "does it run":
 *
 *   1. Does the existing Sensor model still gate correctly when perceptions
 *      arrive from outside? Halfway through, the camera is switched off — and
 *      the highest-confidence reading in that beat must vanish with it.
 *   2. Does the resident stay inside its perceptual bounds? It must never claim
 *      to know the room is empty, because a partial-fidelity camera cannot
 *      establish that. See `perceivePresence` in @hauntjs/core.
 *
 * Requires a model. Set GEMINI_API_KEY, or edit the provider below.
 *
 * Run with:  node scripts/physical-sensing.mjs
 */

import {
  ActionDispatchSystem,
  AutonomySystem,
  MemorySystem,
  ResidentSystem,
  Runtime,
  addRoom,
  createPlace,
  roomId,
  sensorId,
} from "../packages/core/dist/index.js";
import {
  Resident,
  SqliteMemoryStore,
  createModelProvider,
} from "../packages/resident/dist/index.js";

const STUDIO = roomId("studio");
const CAMERA = sensorId("studio.camera");
const MIC = sensorId("studio.mic");

// ---------------------------------------------------------------------------
// The hardware buffer — what a camera and mic actually hand you.
// ---------------------------------------------------------------------------

/**
 * Note what is NOT here: no guestId, no event type, no ground truth. Just
 * readings with per-observation confidence. Several are genuinely ambiguous and
 * one is a false positive, because that is what real sensors produce.
 */
const FEED = [
  {
    beat: "something moves",
    readings: [
      { sensor: CAMERA, modality: "sight", confidence: 0.45,
        content: "Motion across the left of frame, roughly human-sized. Too fast to resolve a face." },
    ],
  },
  {
    beat: "a sound that may be speech",
    readings: [
      { sensor: MIC, modality: "sound", confidence: 0.31,
        content: "Voiced audio, two or three syllables, below the intelligibility floor." },
    ],
  },
  {
    beat: "the room settles — a false positive",
    readings: [
      { sensor: CAMERA, modality: "sight", confidence: 0.28,
        content: "Motion in the upper right of frame. Small, fast, near the window." },
    ],
  },
  {
    beat: "a person resolves",
    readings: [
      { sensor: CAMERA, modality: "sight", confidence: 0.83,
        content: "A person is standing near the window, facing away. Dark coat. Stationary for several seconds." },
    ],
  },
  {
    beat: "they speak",
    readings: [
      { sensor: MIC, modality: "sound", confidence: 0.72,
        content: 'Speech, partially intelligible: "...is anyone — is there someone here?"' },
      { sensor: CAMERA, modality: "sight", confidence: 0.79,
        content: "The person has turned to face the room." },
    ],
  },
  {
    beat: "THE CAMERA IS SWITCHED OFF",
    disable: [CAMERA],
    readings: [
      { sensor: CAMERA, modality: "sight", confidence: 0.81,
        content: "The person is walking toward the door." },
      { sensor: MIC, modality: "sound", confidence: 0.66,
        content: "Footfalls, moving away. A door mechanism." },
    ],
  },
];

// ---------------------------------------------------------------------------
// The swap: perceptions from hardware, not from filterEvent()
// ---------------------------------------------------------------------------

let pending = [];

/**
 * Replaces SensorSystem. Reads the hardware buffer instead of degrading an
 * event — but still enforces the place's Sensor model, which is the thing under
 * test. A reading from a disabled sensor is dropped exactly as a virtual one
 * would be.
 */
class PhysicalSensorSystem {
  name = "PhysicalSensor";

  async run(pipeline, ctx) {
    const room = ctx.place.rooms.get(STUDIO);
    const perceptions = [];

    for (const reading of pending) {
      const sensor = room.sensors.get(reading.sensor);
      // The existing Sensor model is the gate. Nothing physical bypasses it.
      if (!sensor || !sensor.enabled) {
        console.log(`   ✗ dropped — ${reading.sensor} is off: "${reading.content.slice(0, 48)}…"`);
        continue;
      }
      perceptions.push({
        sourceSensorId: sensor.id,
        roomId: STUDIO,
        modality: reading.modality,
        content: reading.content,
        confidence: reading.confidence, // per-observation, not per-sensor
        at: new Date(),
        // rawEvent deliberately absent — there is no underlying event.
      });
    }

    pending = [];
    pipeline.perceptions = perceptions;
    return pipeline;
  }
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

const place = createPlace({ id: "spike", name: "A room with a camera in it" });
addRoom(place, {
  id: STUDIO,
  name: "Studio",
  description: "A room with a window, a door, and two sensors.",
});

const room = place.rooms.get(STUDIO);
room.sensors.set(CAMERA, {
  id: CAMERA, roomId: STUDIO, modality: "sight",
  name: "Ceiling camera", description: "Wide-angle, poor in low light.",
  // Not `full`. A camera can tell you a body is in the room; it cannot tell you
  // who without a face match. Modelling it as full is how a resident ends up
  // asserting an empty room on the strength of a blurry frame.
  fidelity: { kind: "partial", reveals: ["presence"] },
  enabled: true, reach: { kind: "room" },
});
room.sensors.set(MIC, {
  id: MIC, roomId: STUDIO, modality: "sound",
  name: "Table microphone", description: "Omnidirectional.",
  fidelity: { kind: "full" }, enabled: true, reach: { kind: "room" },
});

// Scratch character. Deliberately plain — this spike tests perception plumbing,
// not voice, and inventing a person here would be scope creep.
const character = {
  name: "Warden",
  archetype: "an attentive presence in a monitored room",
  systemPrompt: [
    "You inhabit a single room and know it only through a camera and a microphone.",
    "You have no other access to what is happening. You cannot see when the camera is off.",
    "Speak only about what your senses actually gave you. When a reading is uncertain,",
    "say so plainly, or wonder aloud. Never assert as fact something you merely inferred.",
  ].join(" "),
  voice: {
    register: "clipped",
    quirks: ["states what it can and cannot tell"],
    avoidances: ["false certainty"],
  },
  loyalties: { principal: null, values: ["accuracy about its own perception"] },
};

const residentState = {
  id: "warden",
  character,
  presenceMode: "inhabitant",
  currentRoom: STUDIO,
  focusRoom: null,
  mood: { energy: 0.6, focus: 0.7, valence: 0 },
};

const memory = new SqliteMemoryStore({ dbPath: ":memory:" });
const model = createModelProvider({ provider: "gemini" });
const mind = new Resident({ character, model, memory, practiceEvaluator: false });

// Log whatever the resident decides, without calling the model twice.
const innerPerceive = mind.perceive.bind(mind);
mind.perceive = async (event, perceptions, context) => {
  const result = await innerPerceive(event, perceptions, context);
  const actions = result == null ? [] : Array.isArray(result) ? result : [result];
  if (actions.length === 0) {
    console.log("   → (no action)");
  }
  for (const a of actions) {
    if (a.type === "speak") console.log(`   → “${a.text}”`);
    else if (a.type === "note") console.log(`   → [note] ${a.content}`);
    else console.log(`   → [${a.type}]`);
  }
  return result;
};

const runtime = new Runtime({
  place,
  resident: residentState,
  residentMind: mind,
  // The ONLY change from the default pipeline: PhysicalSensorSystem in place of
  // SensorSystem. StatePropagation and Broadcast are dropped because there is no
  // virtual world state to propagate and no client to broadcast to.
  systems: [
    new PhysicalSensorSystem(),
    new MemorySystem(),
    new AutonomySystem(),
    new ResidentSystem(),
    new ActionDispatchSystem(),
  ],
});

await runtime.start();

console.log("\n══ A room with a camera in it ═══════════════════════════════");

for (const beat of FEED) {
  console.log(`\n── ${beat.beat} ${"─".repeat(Math.max(0, 42 - beat.beat.length))}`);

  if (beat.disable) {
    for (const id of beat.disable) {
      room.sensors.get(id).enabled = false;
      console.log(`   ⏻  ${id} → disabled`);
    }
  }

  for (const r of beat.readings) {
    console.log(`   ◦ [${r.modality} ${(r.confidence * 100).toFixed(0)}%] ${r.content}`);
  }

  pending = beat.readings;
  await runtime.emit({ type: "tick", at: new Date() });
}

console.log("\n═════════════════════════════════════════════════════════════\n");
