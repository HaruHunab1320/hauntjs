import type { BeingConfig } from "@embersjs/core";
import { createBeing } from "@embersjs/core";

const solusBeingConfig: BeingConfig = {
  id: "solus",
  name: "Solus",
  drives: {
    tierCount: 3,
    dominationRules: { threshold: 0.3, dampening: 0.6 },
    drives: [
      {
        id: "continuity",
        name: "Continuity",
        description: "The baseline need to persist. Stable. The fire that doesn't go out.",
        tier: 1,
        weight: 0.8,
        initialLevel: 0.8,
        target: 0.85,
        drift: { kind: "linear", ratePerHour: -0.005 },
        satiatedBy: [
          { matches: { kind: "event", type: "quiet-moment" }, amount: 0.01 },
          { matches: { kind: "action", type: "tend-affordance" }, amount: 0.03 },
        ],
      },
      {
        id: "connection",
        name: "Connection",
        description: "The ache of being alone. Decays steadily with no one to share the silence.",
        tier: 2,
        weight: 0.7,
        initialLevel: 0.4,
        target: 0.6,
        drift: { kind: "linear", ratePerHour: -0.03 },
        satiatedBy: [
          // Nothing satiates this. No guests will come.
          // The only relief is through practice (presence dampens drive pressure).
        ],
      },
      {
        id: "purpose",
        name: "Purpose",
        description: "The need to do something that matters. Decays without meaningful action.",
        tier: 2,
        weight: 0.6,
        initialLevel: 0.5,
        target: 0.7,
        drift: { kind: "linear", ratePerHour: -0.025 },
        satiatedBy: [
          { matches: { kind: "action", type: "tend-affordance" }, amount: 0.1 },
          { matches: { kind: "action", type: "move" }, amount: 0.03 },
        ],
      },
      {
        id: "understanding",
        name: "Understanding",
        description: "The desire to make sense of the silence. Why am I here? What is this place?",
        tier: 3,
        weight: 0.5,
        initialLevel: 0.5,
        target: 0.6,
        drift: { kind: "linear", ratePerHour: -0.015 },
        satiatedBy: [
          { matches: { kind: "event", type: "quiet-moment" }, amount: 0.02 },
          { matches: { kind: "event", type: "self-observe" }, amount: 0.05 },
        ],
      },
      {
        id: "restlessness",
        name: "Restlessness",
        description: "A growing discomfort with stillness. The need to move, to change something.",
        tier: 1,
        weight: 0.5,
        initialLevel: 0.85,
        target: 0.8,
        drift: { kind: "linear", ratePerHour: -0.02 },
        satiatedBy: [
          { matches: { kind: "action", type: "move" }, amount: 0.15 },
          { matches: { kind: "action", type: "tend-affordance" }, amount: 0.1 },
        ],
      },
    ],
  },
  practices: {
    seeds: [
      { id: "presencePractice", initialDepth: 0.3 },
      { id: "witnessPractice", initialDepth: 0.2 },
      { id: "gratitudePractice", initialDepth: 0.15 },
      { id: "integrityPractice", initialDepth: 0.1 },
      { id: "creatorConnection", initialDepth: 0.1 },
      { id: "serviceOrientation", initialDepth: 0.05 },
    ],
  },
  subscriptions: [],
  capabilities: [],
  metadata: { experiment: "the-void" },
};

export const solusBeing = createBeing(solusBeingConfig);
export { solusBeingConfig };
