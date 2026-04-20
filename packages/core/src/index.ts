// Types
export type {
  RoomId,
  AffordanceId,
  GuestId,
  JsonSchema,
  AffordanceAction,
  Affordance,
  Room,
  LoyaltyTier,
  RelationshipState,
  Guest,
  MoodState,
  CharacterDefinition,
  MemoryQuery,
  MemoryResult,
  PlaceMemoryEntry,
  GuestMemory,
  MemoryStore,
  PresenceMode,
  ResidentState,
  Place,
  PresenceEvent,
  ResidentAction,
  ActionResult,
  RuntimeContext,
  PlaceConfig,
  PlaceAdapter,
  RuntimeInterface,
  ResidentInterface,
  SensorId,
  SensorModality,
  SensorFidelity,
  SensorReach,
  PerceptionField,
  Sensor,
  Perception,
  SensorAffect,
} from "./types.js";

// ID constructors
export { roomId, affordanceId, guestId, sensorId } from "./types.js";

// Place state manager
export {
  createPlace,
  addRoom,
  removeRoom,
  connectRooms,
  addAffordance,
  removeAffordance,
  updateAffordanceState,
  getAffordance,
  addGuest,
  enterRoom,
  moveGuest,
  leavePlace,
  getGuestsInRoom,
} from "./place.js";
export type { CreatePlaceOptions, AddRoomOptions, AddGuestOptions } from "./place.js";

// Sensor factories
export {
  presenceSensor,
  sightSensor,
  soundSensor,
  mutedAudioSensor,
  stateSensor,
  textSensor,
  omniscientSensor,
} from "./sensors/index.js";

// Event bus
export { EventBus } from "./event-bus.js";
export type { EventHandler, EventType } from "./event-bus.js";

// Runtime
export { Runtime } from "./runtime.js";
export type { RuntimeOptions } from "./runtime.js";

// Systems pipeline
export {
  StatePropagationSystem,
  MemorySystem,
  AutonomySystem,
  ResidentSystem,
  ActionDispatchSystem,
  BroadcastSystem,
} from "./systems/index.js";
export type { System, SystemContext, PipelineState } from "./systems/index.js";

// Tick scheduler
export { TickScheduler } from "./tick.js";
export type { TickSchedulerOptions } from "./tick.js";
