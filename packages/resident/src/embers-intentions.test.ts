/**
 * The Haunt→Embers intention seam.
 *
 * `embers.ts` is the sole import site for `@embersjs/core` in this package, so
 * these wrappers are the only path Haunt has to the intention layer. Embers has
 * its own tests for the mechanics; what is unproven until here is that Haunt's
 * adapter actually reaches them — a wrapper can compile perfectly and still be
 * pointed at nothing, which is precisely how the expiry API shipped exported
 * from a submodule and unreachable from the package root.
 *
 * So this drives the whole lifecycle through Haunt's wrappers alone, never
 * importing `@embersjs/core` for anything but constructing the Being the way a
 * character config does.
 */

import { createBeing } from "@embersjs/core";
import { describe, expect, it } from "vitest";
import type { Being, Satisfier } from "./embers.js";
import {
  embersCommit,
  embersCurrentIntentions,
  embersDecline,
  embersEligibleToSurface,
  embersEndIntention,
  embersExpirePursuits,
  embersIntegrate,
  embersRecordAction,
  embersSurface,
  embersTickBeing,
  embersUrgency,
} from "./embers.js";

const HOUR = 3_600_000;

const HEARTH: Satisfier = {
  kind: "affordance",
  ref: "hearth",
  params: { actionId: "light" },
};

/** A being that can actually pursue something — a drive with a satisfier attached. */
function beingWithPursuit(level = 0.1): Being {
  return createBeing({
    id: "seam",
    name: "Seam",
    drives: {
      tierCount: 1,
      drives: [
        {
          id: "connection",
          name: "Connection",
          description: "The need to be met.",
          tier: 1,
          weight: 1,
          initialLevel: level,
          target: 0.8,
          drift: { kind: "linear", ratePerHour: -0.01 },
          // Embers-side vocabulary, not Haunt's. `mapEventToInput` translates
          // `guest.spoke` into `conversation`, and a config that matches on the
          // Haunt event name instead produces a drive that silently never
          // satiates. See the note in embers.ts.
          satiatedBy: [{ matches: { kind: "event", type: "conversation" }, amount: 0.9 }],
          pursuableBy: [{ satisfier: HEARTH, hint: "the fire" }],
        },
      ],
    },
    practices: { seeds: [] },
    subscriptions: [],
    capabilities: [],
  });
}

describe("intention seam", () => {
  it("reports an eligible pressure with a satisfier Haunt can resolve", () => {
    const being = beingWithPursuit();
    const eligible = embersEligibleToSurface(being);

    expect(eligible).toHaveLength(1);
    expect(eligible[0]!.driveId).toBe("connection");
    // The token is opaque to Embers and meaningful to Haunt — this is the shape
    // the resident turns into a ResidentAction.
    expect(eligible[0]!.satisfier.kind).toBe("affordance");
    expect(eligible[0]!.satisfier.ref).toBe("hearth");
    expect(eligible[0]!.hint).toBe("the fire");
  });

  it("reports nothing for a drive with no pursuables", () => {
    const being = createBeing({
      id: "latent",
      name: "Latent",
      drives: {
        tierCount: 1,
        drives: [
          {
            id: "connection",
            name: "Connection",
            description: "",
            tier: 1,
            weight: 1,
            initialLevel: 0.1,
            target: 0.8,
            drift: { kind: "linear", ratePerHour: 0 },
            satiatedBy: [],
          },
        ],
      },
      practices: { seeds: [] },
      subscriptions: [],
      capabilities: [],
    });

    expect(embersEligibleToSurface(being)).toHaveLength(0);
  });

  it("runs the full lifecycle through Haunt's wrappers", () => {
    const being = beingWithPursuit();

    const eligible = embersEligibleToSurface(being)[0]!;
    const candidate = embersSurface(being, {
      sourceDriveId: eligible.driveId,
      satisfier: eligible.satisfier,
      aim: "tend the fire before it goes out",
      trigger: { kind: "coincidence", note: "the hearth is visibly dying" },
    });

    // Surfacing alone commits to nothing.
    expect(embersCurrentIntentions(being)).toHaveLength(0);

    const intention = embersCommit(being, candidate.id);
    expect(embersCurrentIntentions(being).map((i) => i.aim)).toEqual([
      "tend the fire before it goes out",
    ]);
    expect(embersUrgency(being, intention)).toBeGreaterThan(0);

    embersRecordAction(being, intention.id);
    expect(embersCurrentIntentions(being)[0]!.attempts).toBe(1);

    embersEndIntention(being, intention.id, { kind: "satisfied" });
    expect(embersCurrentIntentions(being)).toHaveLength(0);
  });

  it("declines without discharging the pressure", () => {
    const being = beingWithPursuit();
    const eligible = embersEligibleToSurface(being)[0]!;
    const candidate = embersSurface(being, {
      sourceDriveId: eligible.driveId,
      satisfier: eligible.satisfier,
      aim: "tend the fire",
      trigger: { kind: "quiet" },
    });

    embersDecline(being, candidate.id, "a guest is speaking");

    expect(embersCurrentIntentions(being)).toHaveLength(0);
    // Still pressing — a decline is not a discharge. But suppressed for now,
    // so the resident is not re-offered the same impulse every tick.
    expect(being.drives.drives.get("connection")!.level).toBeCloseTo(0.1, 10);
    expect(embersEligibleToSurface(being)).toHaveLength(0);
  });

  it("stops offering a pursuit already committed to", () => {
    const being = beingWithPursuit();
    const eligible = embersEligibleToSurface(being)[0]!;
    const candidate = embersSurface(being, {
      sourceDriveId: eligible.driveId,
      satisfier: eligible.satisfier,
      aim: "tend the fire",
      trigger: { kind: "quiet" },
    });
    embersCommit(being, candidate.id);

    expect(embersEligibleToSurface(being)).toHaveLength(0);
  });

  it("expires a pursuit once a Haunt event satisfies its drive", () => {
    const being = beingWithPursuit();
    const eligible = embersEligibleToSurface(being)[0]!;
    const candidate = embersSurface(being, {
      sourceDriveId: eligible.driveId,
      satisfier: eligible.satisfier,
      aim: "tend the fire",
      trigger: { kind: "quiet" },
    });
    embersCommit(being, candidate.id);

    expect(embersExpirePursuits(being)).toHaveLength(0);

    // A real Haunt event, mapped through the adapter, discharges the drive.
    embersIntegrate(being, {
      type: "guest.spoke",
      guestId: "takeshi" as never,
      roomId: "lobby" as never,
      text: "Good evening.",
      at: new Date(),
    });

    const lapsed = embersExpirePursuits(being);
    expect(lapsed).toHaveLength(1);
    expect(embersCurrentIntentions(being)).toHaveLength(0);
  });

  it("urgency tracks being-time, so a stale pursuit fades", () => {
    const being = beingWithPursuit();
    const eligible = embersEligibleToSurface(being)[0]!;
    const candidate = embersSurface(being, {
      sourceDriveId: eligible.driveId,
      satisfier: eligible.satisfier,
      aim: "tend the fire",
      trigger: { kind: "quiet" },
    });
    const intention = embersCommit(being, candidate.id);
    const fresh = embersUrgency(being, intention);

    embersTickBeing(being, 6 * HOUR);

    const aged = embersUrgency(being, embersCurrentIntentions(being)[0]!);
    expect(aged).toBeLessThan(fresh);
  });
});
