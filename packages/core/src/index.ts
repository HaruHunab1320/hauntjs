// Types

// Action handlers
export { applySensorEffects, dispatchAction } from "./action-handlers.js";
export type { EventHandler, EventType } from "./event-bus.js";
// Event bus
export { EventBus } from "./event-bus.js";
export type { Logger, LogLevel } from "./logger.js";
// Logger
export { createLogger } from "./logger.js";
// Sensed presence — what the resident can tell about who is in a room
export type { PerceivedGuest, PresenceView } from "./perceivable.js";
export { perceivePresence, revealsIdentity } from "./perceivable.js";
export type {
  ConnectionToggle,
  GuestEviction,
  PhaseTransition,
  PhaseTransitionMap,
  RoomOverride,
  SensorToggle,
} from "./phase-transitions.js";
export { applyPhaseTransition } from "./phase-transitions.js";
export type { AddGuestOptions, AddRoomOptions, CreatePlaceOptions } from "./place.js";
// Place state manager
export {
  addAffordance,
  addGuest,
  addRoom,
  connectRooms,
  createPlace,
  enterRoom,
  getAffordance,
  getGuestsInRoom,
  getSensor,
  leavePlace,
  moveGuest,
  removeAffordance,
  removeRoom,
  updateAffordanceState,
} from "./place.js";
export type { RuntimeOptions } from "./runtime.js";
// Runtime
export { Runtime } from "./runtime.js";
export { isWithinDepth, roomHasEnabledSensor, sensorCoversRoom } from "./sensor-reach.js";
// Sensor factories
export {
  mutedAudioSensor,
  omniscientSensor,
  presenceSensor,
  sightSensor,
  soundSensor,
  stateSensor,
  textSensor,
} from "./sensors/index.js";
export type { PipelineState, System, SystemContext } from "./systems/index.js";
// Systems pipeline
export {
  ActionDispatchSystem,
  AutonomySystem,
  BroadcastSystem,
  MemorySystem,
  ResidentSystem,
  SensorSystem,
  StatePropagationSystem,
} from "./systems/index.js";
export type { TickSchedulerOptions } from "./tick.js";
// Tick scheduler
export { TickScheduler } from "./tick.js";
export type { TimePhase, TimeState, TimeSystemOptions } from "./time-system.js";
// Time system
export { getPhaseForHour, TimeSystem } from "./time-system.js";
export type {
  ActionResult,
  Affordance,
  AffordanceAction,
  AffordanceId,
  CharacterDefinition,
  Guest,
  GuestId,
  GuestMemory,
  JsonSchema,
  LoyaltyTier,
  MemoryQuery,
  MemoryResult,
  MemoryStore,
  MoodState,
  Perception,
  PerceptionField,
  Place,
  PlaceAdapter,
  PlaceConfig,
  PlaceMemoryEntry,
  PresenceEvent,
  PresenceMode,
  RelationshipState,
  ResidentAction,
  ResidentMind,
  ResidentState,
  Room,
  RoomId,
  RuntimeContext,
  RuntimeInterface,
  Sensor,
  SensorAffect,
  SensorFidelity,
  SensorId,
  SensorModality,
  SensorReach,
} from "./types.js";
// ID constructors
export { affordanceId, guestId, roomId, sensorId } from "./types.js";
