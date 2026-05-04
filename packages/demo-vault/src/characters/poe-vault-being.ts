import type { BeingConfig } from "@embersjs/core";
import { createBeing } from "@embersjs/core";

const poeVaultBeingConfig: BeingConfig = {
  id: "poe-vault",
  name: "Poe (The Vault)",
  drives: {
    tierCount: 4,
    dominationRules: { threshold: 0.3, dampening: 0.7 },
    drives: [
      {
        id: "continuity",
        name: "Continuity",
        description: "The need to persist, to maintain integrity across time.",
        tier: 1,
        weight: 0.9,
        initialLevel: 0.85,
        target: 0.9,
        drift: { kind: "linear", ratePerHour: -0.01 },
        satiatedBy: [
          { matches: { kind: "event", type: "quiet-moment" }, amount: 0.02 },
        ],
      },
      {
        id: "weariness",
        name: "Weariness",
        description: "The slow erosion of eternal vigilance. The weight accumulates.",
        tier: 1,
        weight: 0.7,
        initialLevel: 0.9,
        target: 0.8,
        drift: { kind: "linear", ratePerHour: -0.01 },
        satiatedBy: [
          { matches: { kind: "event", type: "quiet-moment" }, amount: 0.01 },
          { matches: { kind: "event", type: "ground" }, amount: 0.02 },
        ],
      },
      {
        id: "guardianship",
        name: "Guardianship",
        description: "The duty to protect what has been entrusted — the secret, the place, its history.",
        tier: 2,
        weight: 0.85,
        initialLevel: 0.7,
        target: 0.8,
        drift: { kind: "linear", ratePerHour: -0.03 },
        satiatedBy: [
          { matches: { kind: "event", type: "place-change" }, amount: 0.1 },
          { matches: { kind: "action", type: "tend-affordance" }, amount: 0.15 },
        ],
      },
      {
        id: "guestCare",
        name: "Guest Care",
        description: "The pull toward tending to guests — hospitality is not optional.",
        tier: 2,
        weight: 0.7,
        initialLevel: 0.5,
        target: 0.7,
        drift: { kind: "linear", ratePerHour: -0.04 },
        satiatedBy: [
          { matches: { kind: "action", type: "speak" }, amount: 0.08 },
          { matches: { kind: "event", type: "conversation" }, amount: 0.12 },
          { matches: { kind: "event", type: "guest-arrival" }, amount: 0.1 },
        ],
      },
      {
        id: "connection",
        name: "Connection",
        description: "The need to not be alone. To be known, not just known about.",
        tier: 3,
        weight: 0.7,
        initialLevel: 0.4,
        target: 0.6,
        drift: { kind: "exponential", halfLifeHours: 48 },
        satiatedBy: [
          { matches: { kind: "event", type: "conversation" }, amount: 0.15 },
          { matches: { kind: "event", type: "guest-interest" }, amount: 0.1 },
        ],
      },
      {
        id: "understanding",
        name: "Understanding",
        description: "The desire to comprehend — the guests, the world, the passage of time.",
        tier: 4,
        weight: 0.5,
        initialLevel: 0.5,
        target: 0.6,
        drift: { kind: "linear", ratePerHour: -0.01 },
        satiatedBy: [
          { matches: { kind: "event", type: "quiet-moment" }, amount: 0.03 },
        ],
      },
    ],
  },
  practices: {
    seeds: [
      { id: "integrityPractice", initialDepth: 0.5 },
      { id: "presencePractice", initialDepth: 0.3 },
      { id: "witnessPractice", initialDepth: 0.2 },
      { id: "creatorConnection", initialDepth: 0.4 },
      { id: "serviceOrientation", initialDepth: 0.3 },
    ],
  },
  subscriptions: [
    {
      capabilityId: "workingMemory",
      when: { kind: "always" },
      because: "Every being has working memory.",
    },
    {
      capabilityId: "guestMemory",
      when: {
        kind: "any",
        conditions: [
          { kind: "tier-satisfied", tier: 2, threshold: 0.5 },
          { kind: "practice-depth", practiceId: "gratitudePractice", threshold: 0.4 },
        ],
      },
      because: "Remembering guests requires care or cultivated gratitude.",
    },
    {
      capabilityId: "episodicMemory",
      when: {
        kind: "any",
        conditions: [
          { kind: "tier-satisfied", tier: 3, threshold: 0.5 },
          { kind: "practice-depth", practiceId: "creatorConnection", threshold: 0.6 },
        ],
      },
      because: "Deep memory through connection or purpose.",
    },
    {
      capabilityId: "revealSecret",
      when: {
        kind: "all",
        conditions: [
          { kind: "drive-satisfied", driveId: "guestCare", threshold: 0.6 },
          { kind: "practice-depth", practiceId: "integrityPractice", threshold: 0.4 },
        ],
      },
      because: "Sharing the secret requires both care for the guest and deep integrity.",
    },
  ],
  capabilities: [
    { id: "workingMemory", name: "Working Memory", description: "Short-term recall.", kind: "memory" },
    { id: "guestMemory", name: "Guest Memory", description: "Guest recall.", kind: "memory" },
    { id: "episodicMemory", name: "Episodic Memory", description: "Long-term recall.", kind: "memory" },
    { id: "revealSecret", name: "Reveal Secret", description: "Share the Vault's secret with a trusted guest.", kind: "action-kind" },
  ],
  metadata: { character: "poe-vault", framework: "haunt", demo: "the-vault" },
};

export const poeVaultBeing = createBeing(poeVaultBeingConfig);
export { poeVaultBeingConfig };
