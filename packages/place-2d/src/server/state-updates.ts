import type { AffordanceAction } from "@hauntjs/core";

/**
 * Gets the state change for an affordance action.
 * Prefers the data-driven `stateChange` field on the action definition.
 * Falls back to legacy hardcoded mappings for backward compatibility.
 */
export function getStateUpdate(
  actionId: string,
  action?: AffordanceAction,
): Record<string, unknown> | null {
  // Data-driven: use stateChange from the action definition if available
  if (action?.stateChange) {
    return action.stateChange;
  }

  // Legacy fallback for actions without stateChange
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
