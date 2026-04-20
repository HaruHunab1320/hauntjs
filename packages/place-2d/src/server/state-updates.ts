/**
 * Maps affordance action IDs to state changes.
 * Shared between the WebSocket server (guest interactions) and the adapter (resident actions).
 *
 * TODO: This should be data-driven from affordance definitions, not hardcoded.
 */
export function getStateUpdate(actionId: string): Record<string, unknown> | null {
  switch (actionId) {
    case "light":
      return { lit: true };
    case "extinguish":
      return { lit: false };
    case "leave-note":
      return { hasNote: true };
    case "turn-on":
      return { on: true };
    case "turn-off":
      return { on: false };
    case "open":
      return { open: true };
    case "close":
      return { open: false };
    default:
      return null;
  }
}
