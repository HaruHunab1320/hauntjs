// Branded ID types
export type RoomId = string & { readonly __brand: "RoomId" };
export type AffordanceId = string & { readonly __brand: "AffordanceId" };
export type GuestId = string & { readonly __brand: "GuestId" };

export function roomId(id: string): RoomId {
  return id as RoomId;
}

export function affordanceId(id: string): AffordanceId {
  return id as AffordanceId;
}

export function guestId(id: string): GuestId {
  return id as GuestId;
}

// --- JSON Schema placeholder for affordance action params ---

export type JsonSchema = Record<string, unknown>;

// --- Affordance ---

export interface AffordanceAction {
  id: string;
  name: string;
  description: string;
  params?: Record<string, JsonSchema>;
  availableWhen?: (state: Record<string, unknown>) => boolean;
  /** State changes to apply to the affordance when this action runs. */
  stateChange?: Record<string, unknown>;
  /** Sensor effects to apply when this action runs. */
  affects?: SensorAffect[];
}

export interface Affordance {
  id: AffordanceId;
  roomId: RoomId;
  kind: string;
  name: string;
  description: string;
  state: Record<string, unknown>;
  actions: AffordanceAction[];
  sensable: boolean;
}

// --- Sensors ---

export type SensorId = string & { readonly __brand: "SensorId" };

export function sensorId(id: string): SensorId {
  return id as SensorId;
}

/** The type of sensory information a sensor provides. */
export type SensorModality = "sight" | "sound" | "presence" | "state" | "text" | (string & {}); // extensible — adapters can define more

/** How much detail the sensor reveals. */
export type SensorFidelity =
  | { kind: "full" }
  | { kind: "partial"; reveals: PerceptionField[] }
  | { kind: "ambiguous"; confidence: number }
  | { kind: "delayed"; delayMs: number };

/** What aspects of an event a sensor can reveal. */
export type PerceptionField =
  | "presence"
  | "identity"
  | "content"
  | "count"
  | "mood"
  | (string & {});

/** The spatial scope of what a sensor can detect. */
export type SensorReach =
  | { kind: "room" }
  | { kind: "adjacent"; maxDepth?: number }
  | { kind: "affordance"; affordanceId: AffordanceId }
  | { kind: "place-wide" };

/** A sensor installed in a room. Channels through which events become perceptible. */
export interface Sensor {
  id: SensorId;
  roomId: RoomId;
  modality: SensorModality;
  name: string;
  description: string;
  fidelity: SensorFidelity;
  enabled: boolean;
  reach: SensorReach;
}

/** What the resident actually perceives — the sensor's report, not the raw event. */
export interface Perception {
  sourceSensorId: SensorId;
  roomId: RoomId;
  modality: SensorModality;
  content: string;
  confidence: number;
  at: Date;
  rawEvent?: PresenceEvent;
}

/** How an affordance action affects a sensor. */
export interface SensorAffect {
  sensorId: SensorId;
  change: { enabled: boolean } | { fidelity: SensorFidelity };
}

// --- Room ---

export interface Room {
  id: RoomId;
  name: string;
  description: string;
  affordances: Map<AffordanceId, Affordance>;
  sensors: Map<SensorId, Sensor>;
  connectedTo: RoomId[];
  state: Record<string, unknown>;
}

// --- Guest ---

export type LoyaltyTier = "principal" | "regular" | "visitor" | "stranger";

export interface RelationshipState {
  notes: string[];
  sentiment: number; // -1 to 1
}

export interface Guest {
  id: GuestId;
  name: string;
  currentRoom: RoomId | null;
  firstSeen: Date;
  lastSeen: Date;
  visitCount: number;
  loyaltyTier: LoyaltyTier;
  relationship: RelationshipState;
}

// --- Resident (minimal shape for core — full definition lives in @hauntjs/resident) ---

export type MoodState = {
  energy: number; // 0-1
  focus: number; // 0-1
  valence: number; // -1 to 1
};

export interface CharacterDefinition {
  name: string;
  archetype: string;
  systemPrompt: string;
  voice: {
    register: "formal" | "warm" | "clipped" | "poetic";
    quirks: string[];
    avoidances: string[];
  };
  loyalties: {
    principal: string | null;
    values: string[];
  };
  decay?: {
    enabled: boolean;
    severity: number;
    symptoms: string[];
  };
}

export interface MemoryQuery {
  guestId?: GuestId;
  tags?: string[];
  limit?: number;
}

export interface MemoryResult {
  content: string;
  tags: string[];
  createdAt: Date;
  importance: number;
}

export interface PlaceMemoryEntry {
  id?: string;
  content: string;
  tags: string[];
  createdAt: Date;
  importance: number;
}

export interface GuestMemory {
  guestId: GuestId;
  facts: Record<string, string>;
  updatedAt: Date;
}

export interface MemoryStore {
  workingMemory: PresenceEvent[];
  guestMemory: Map<GuestId, GuestMemory>;
  placeMemory: PlaceMemoryEntry[];

  recall(query: MemoryQuery): Promise<MemoryResult[]>;
  remember(entry: PlaceMemoryEntry): Promise<void>;
  updateGuest(id: GuestId, update: Partial<GuestMemory>): Promise<void>;
}

/** How the resident relates to physical space. */
export type PresenceMode = "host" | "inhabitant" | "presence";

export interface ResidentState {
  id: string;
  character: CharacterDefinition;
  presenceMode: PresenceMode;
  currentRoom: RoomId;
  focusRoom: RoomId | null;
  mood: MoodState;
  /** Opaque inner-life state from @embersjs/core. Optional — residents without a Being use static mood. */
  being?: unknown;
}

// --- Place ---

export interface Place {
  id: string;
  name: string;
  rooms: Map<RoomId, Room>;
  guests: Map<GuestId, Guest>;
  metadata: Record<string, unknown>;
}

// --- Events ---

export type PresenceEvent =
  | { type: "guest.entered"; guestId: GuestId; roomId: RoomId; at: Date }
  | { type: "guest.left"; guestId: GuestId; roomId: RoomId; at: Date }
  | { type: "guest.moved"; guestId: GuestId; from: RoomId; to: RoomId; at: Date }
  | { type: "guest.spoke"; guestId: GuestId; roomId: RoomId; text: string; at: Date }
  | {
      type: "guest.approached";
      guestId: GuestId;
      roomId: RoomId;
      affordanceId: AffordanceId;
      at: Date;
    }
  | {
      type: "affordance.changed";
      affordanceId: AffordanceId;
      roomId: RoomId;
      prevState: Record<string, unknown>;
      newState: Record<string, unknown>;
      at: Date;
    }
  | { type: "resident.moved"; from: RoomId; to: RoomId; at: Date }
  | { type: "resident.spoke"; roomId: RoomId; text: string; audience: GuestId[]; at: Date }
  | { type: "resident.acted"; affordanceId: AffordanceId; actionId: string; at: Date }
  | { type: "time.phaseChanged"; from: string; to: string; inWorldHour: number; day: number; at: Date }
  | { type: "tick"; at: Date };

// --- Actions ---

export type ResidentAction =
  | { type: "speak"; text: string; audience: GuestId[] | "all"; roomId?: RoomId }
  | { type: "move"; toRoom: RoomId }
  | { type: "focus"; roomId: RoomId }
  | {
      type: "act";
      affordanceId: AffordanceId;
      actionId: string;
      params?: Record<string, unknown>;
    }
  | { type: "note"; content: string; about: GuestId | "self" }
  | { type: "wait" };

export interface ActionResult {
  success: boolean;
  error?: string;
  event?: PresenceEvent;
}

// --- Runtime Context (passed to the resident on perceive) ---

export interface RuntimeContext {
  place: Place;
  resident: ResidentState;
  recentEvents: PresenceEvent[];
  guestsInRoom: Guest[];
}

// --- Place Adapter interface ---

export interface PlaceConfig {
  id: string;
  name: string;
  rooms: Omit<Room, "affordances">[];
  affordances: Omit<Affordance, "roomId">[];
  metadata?: Record<string, unknown>;
}

export interface PlaceAdapter {
  name: string;
  mount(config: PlaceConfig): Promise<Place>;
  start(runtime: RuntimeInterface): Promise<void>;
  stop(): Promise<void>;
  applyAction(action: ResidentAction, place: Place): Promise<ActionResult>;
}

// --- Runtime interface (what adapters and residents see) ---

export interface RuntimeInterface {
  place: Place;
  resident: ResidentState;
  eventBus: import("./event-bus.js").EventBus;
  emit(event: PresenceEvent): Promise<void>;
  applyAction(action: ResidentAction): Promise<ActionResult>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

// --- Resident interface (what the runtime calls) ---

export interface ResidentMind {
  perceive(
    event: PresenceEvent,
    perceptions: Perception[],
    context: RuntimeContext,
  ): Promise<ResidentAction | ResidentAction[] | null>;
}
