// Server
export { Place2DAdapter } from "./server/adapter.js";
export type { Place2DConfig } from "./server/adapter.js";
export { Place2DServer } from "./server/websocket.js";
export type { Place2DServerOptions } from "./server/websocket.js";

// Protocol
export { ClientMessage } from "./server/protocol.js";
export type {
  ServerMessage,
  PublicPlaceState,
  PublicRoomState,
  PublicAffordanceState,
  TelemetrySnapshot,
} from "./server/protocol.js";

// World config
export { ROOST_CONFIG, ROOST_ROOMS, ROOST_AFFORDANCES } from "./server/world-config.js";
