// Shared protocol types used by both server and client.
// This file contains only type definitions — no runtime code.

export interface PublicAffordanceState {
  id: string;
  roomId: string;
  kind: string;
  name: string;
  description: string;
  state: Record<string, unknown>;
  actions: Array<{
    id: string;
    name: string;
    description: string;
    available: boolean;
  }>;
}

export interface PublicRoomState {
  id: string;
  name: string;
  description: string;
  connectedTo: string[];
  affordances: PublicAffordanceState[];
  guests: Array<{ id: string; name: string }>;
}

export interface PublicPlaceState {
  id: string;
  name: string;
  rooms: PublicRoomState[];
  currentRoom: string | null;
  residentRoom: string;
}

export type ServerMessage =
  | { type: "state"; place: PublicPlaceState }
  | { type: "joined"; guestId: string; roomId: string }
  | { type: "guest.entered"; guestId: string; guestName: string; roomId: string }
  | { type: "guest.left"; guestId: string; guestName: string; roomId: string }
  | { type: "guest.moved"; guestId: string; guestName: string; from: string; to: string }
  | { type: "guest.spoke"; guestId: string; guestName: string; roomId: string; text: string }
  | { type: "resident.spoke"; text: string; roomId: string }
  | { type: "resident.moved"; from: string; to: string }
  | {
      type: "affordance.changed";
      affordanceId: string;
      roomId: string;
      newState: Record<string, unknown>;
    }
  | { type: "error"; message: string }
  | {
      type: "debug.snapshot";
      sensors: DebugSensorInfo[];
      recentPerceptions: DebugPerceptionInfo[];
    }
  | { type: "time.phaseChanged"; from: string; to: string; inWorldHour: number; day: number }
  | { type: "telemetry"; data: TelemetrySnapshot };

export interface DebugSensorInfo {
  id: string;
  roomId: string;
  roomName: string;
  modality: string;
  name: string;
  enabled: boolean;
  fidelity: string;
  reach: string;
}

export interface DebugPerceptionInfo {
  sensorId: string;
  roomId: string;
  modality: string;
  content: string;
  confidence: number;
  at: string;
}

// --- Telemetry (for spectator dashboard) ---

export interface TelemetrySnapshot {
  time: {
    phase: string;
    inWorldHour: number;
    day: number;
  };
  resident: {
    id: string;
    name: string;
    focusRoom: string | null;
    orientation: string | null;
    felt: string | null;
    lastAction: string | null;
    drives?: Array<{ id: string; name: string; level: number; pressure: number }>;
  };
  guests: Array<{
    id: string;
    name: string;
    currentRoom: string | null;
    goal?: string;
    felt?: string | null;
    lastAction?: string | null;
    trustWithResident?: number;
  }>;
  sensors: DebugSensorInfo[];
}
