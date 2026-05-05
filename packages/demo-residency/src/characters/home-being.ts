import type { BeingConfig } from "@embersjs/core";
import { createBeing } from "@embersjs/core";

const homeBeingConfig: BeingConfig = {
  id: "home",
  name: "Home (The Residency)",
  drives: {
    tierCount: 2,
    dominationRules: { threshold: 0.3, dampening: 0.7 },
    drives: [
      {
        id: "comfort",
        name: "Comfort",
        description: "The need to maintain a pleasant, livable space for the inhabitants.",
        tier: 1,
        weight: 0.8,
        initialLevel: 0.7,
        target: 0.8,
        drift: { kind: "linear", ratePerHour: -0.02 },
        satiatedBy: [
          { matches: { kind: "event", type: "quiet-moment" }, amount: 0.03 },
          { matches: { kind: "action", type: "tend-affordance" }, amount: 0.08 },
        ],
      },
      {
        id: "order",
        name: "Order",
        description: "The pull toward things being tended — dishes washed, garden watered, doors closed.",
        tier: 1,
        weight: 0.7,
        initialLevel: 0.6,
        target: 0.7,
        drift: { kind: "linear", ratePerHour: -0.03 },
        satiatedBy: [
          { matches: { kind: "action", type: "tend-affordance" }, amount: 0.1 },
          { matches: { kind: "event", type: "place-change" }, amount: 0.05 },
        ],
      },
      {
        id: "responsiveness",
        name: "Responsiveness",
        description: "The duty to answer when spoken to, to be present when needed.",
        tier: 2,
        weight: 0.6,
        initialLevel: 0.5,
        target: 0.6,
        drift: { kind: "linear", ratePerHour: -0.02 },
        satiatedBy: [
          { matches: { kind: "action", type: "speak" }, amount: 0.06 },
          { matches: { kind: "event", type: "conversation" }, amount: 0.08 },
        ],
      },
    ],
  },
  practices: {
    seeds: [
      { id: "serviceOrientation", initialDepth: 0.4 },
      { id: "presencePractice", initialDepth: 0.5 },
    ],
  },
  subscriptions: [],
  capabilities: [],
  metadata: { character: "home", framework: "haunt", demo: "the-residency" },
};

export const homeBeing = createBeing(homeBeingConfig);
export { homeBeingConfig };
