import { computeDepth, createBeing } from "@embersjs/core";
import { describe, expect, it } from "vitest";
import { priorCultivation } from "./prior-cultivation.js";

/** Builds a being seeded with one practice at the given prior depth. */
function beingSeededAt(depth: number, options?: Parameters<typeof priorCultivation>[1]) {
  return createBeing({
    id: "seed-test",
    name: "Seed Test",
    drives: {
      tierCount: 1,
      drives: [
        {
          id: "continuity",
          name: "Continuity",
          description: "t",
          tier: 1,
          weight: 1,
          initialLevel: 0.8,
          target: 0.85,
          drift: { kind: "linear", ratePerHour: -0.01 },
          satiatedBy: [],
        },
      ],
    },
    practices: {
      seeds: [{ id: "presencePractice", initialArtifacts: priorCultivation(depth, options) }],
    },
    subscriptions: [],
    capabilities: [],
  });
}

function depthOf(being: ReturnType<typeof createBeing>): number {
  return computeDepth(being.practices.practices.get("presencePractice")!, being.elapsedMs);
}

describe("priorCultivation", () => {
  // These are the depths actually used across the Roost, Vault, Residency and
  // Void character configs.
  it.each([
    0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.75, 1,
  ])("produces substrate deriving to depth %s", (depth) => {
    expect(depthOf(beingSeededAt(depth))).toBeCloseTo(depth, 5);
  });

  it("returns no artifacts for depth 0", () => {
    expect(priorCultivation(0)).toEqual([]);
    expect(depthOf(beingSeededAt(0))).toBe(0);
  });

  it("keeps every artifact quality within [0, 1]", () => {
    for (const depth of [0.05, 0.3, 0.6, 1]) {
      for (const artifact of priorCultivation(depth)) {
        expect(artifact.quality).toBeGreaterThan(0);
        expect(artifact.quality).toBeLessThanOrEqual(1);
      }
    }
  });

  it("uses fewer artifacts when the cultivation was pressure-tested", () => {
    const calm = priorCultivation(0.6);
    const pressured = priorCultivation(0.6, { underPressure: true });
    expect(pressured.length).toBeLessThan(calm.length);
    expect(depthOf(beingSeededAt(0.6, { underPressure: true }))).toBeCloseTo(0.6, 5);
  });

  it("compensates for age so aged substrate still starts at the authored depth", () => {
    const week = 7 * 24 * 3_600_000;
    expect(depthOf(beingSeededAt(0.3, { ageMs: week }))).toBeCloseTo(0.3, 5);
  });

  it("carries authored content through to the substrate", () => {
    const [artifact] = priorCultivation(0.1, { content: { note: "years of night shifts" } });
    expect(artifact!.content).toEqual({ note: "years of night shifts" });
  });

  it("rejects a depth outside [0, 1] instead of clamping", () => {
    expect(() => priorCultivation(1.5)).toThrow(RangeError);
    expect(() => priorCultivation(-0.1)).toThrow(RangeError);
  });

  it("rejects an age that makes the requested depth unreachable", () => {
    const year = 365 * 24 * 3_600_000;
    expect(() => priorCultivation(0.9, { ageMs: year })).toThrow(RangeError);
  });

  it("decays from the authored depth rather than holding it", () => {
    const being = beingSeededAt(0.4);
    expect(depthOf(being)).toBeCloseTo(0.4, 5);
    // Two half-lives later, roughly a quarter remains.
    being.elapsedMs = 14 * 24 * 3_600_000;
    expect(depthOf(being)).toBeCloseTo(0.1, 2);
  });
});
