/**
 * Recovery Protocol v2, held to the numbers in the specification.
 *
 * These assert the thresholds and protocol lengths the spec states, because
 * this is a recovery prescription for a real athlete: a tier boundary that
 * drifts from 60 pitches to 50, or a heavy protocol that quietly shortens to
 * three days, is a training error rather than a failing test.
 *
 * The one thing asserted hardest is that no cold modality can appear anywhere.
 */

import { describe, expect, it } from "vitest";
import {
  ACWR_BAND,
  BFR_BLOCK,
  EQUIPMENT_LABELS,
  INTENT_PERCENT,
  INTENT_PERCENT_RANGE,
  OWNED_EQUIPMENT,
  readEquipment,
  readIntentPercent,
  recoveryForDay,
  COLD_POLICY,
  CONFLICT_RULES,
  PRE_THROW_STRETCH_BLOCK_HOURS,
  TRIGGER,
  acwrReading,
  buildGymRecoveryPlan,
  buildThrowingRecoveryPlan,
  checkPitchSmartRest,
  classifyThrowingLoadTier,
  isPosteriorStretchBlocked,
  postScapularRangeAnnotation,
  protocolLengthForTier,
  triggersRecovery,
} from "./recoveryProtocol";

const OUTING = "2026-08-14";

describe("no cold, anywhere", () => {
  const COLD = /\bice\b|icing|cold[- ]water|cwi\b|cryo|contrast bath|cooling/i;

  it("is stated as the policy", () => {
    expect(COLD_POLICY.allowed).toBe(false);
    expect(COLD_POLICY.id).toBe("throwing-recovery-no-cold-v2");
  });

  it("appears in no prescription of any throwing plan", () => {
    for (const tier of ["light", "moderate", "heavy"] as const) {
      const plan = buildThrowingRecoveryPlan({ tier, outingDate: OUTING, bodyweightKg: 85 });
      for (const day of plan.days) {
        for (const block of day.blocks) {
          expect(block.name, `${tier} ${block.id} name`).not.toMatch(COLD);
          expect(block.prescription, `${tier} ${block.id} prescription`).not.toMatch(COLD);
        }
      }
    }
  });

  it("appears in no prescription of any gym plan", () => {
    for (const sessionType of ["hypertrophy", "max_strength", "conditioning"] as const) {
      const plan = buildGymRecoveryPlan({ sessionType, sessionDate: OUTING, bodyweightKg: 85 });
      for (const day of plan.days) {
        for (const block of day.blocks) {
          expect(block.prescription, `${sessionType} ${block.id}`).not.toMatch(COLD);
        }
      }
    }
  });

  it("says what dropping it costs rather than pretending it is free", () => {
    expect(COLD_POLICY.cost).toContain("n = 16");
    expect(COLD_POLICY.insteadCarriedBy).toMatch(/compression/i);
  });
});

describe("what starts a protocol", () => {
  it("triggers at the stated intent and throw count", () => {
    expect(TRIGGER).toEqual({ intentPercent: 80, totalThrows: 30 });
    expect(triggersRecovery({ intentPercent: 80 })).toBe(true);
    expect(triggersRecovery({ totalThrows: 30 })).toBe(true);
  });

  it("does not trigger below both", () => {
    expect(triggersRecovery({ intentPercent: 70, totalThrows: 20 })).toBe(false);
  });

  it("always triggers on a competitive start", () => {
    expect(triggersRecovery({ competitiveStart: true })).toBe(true);
  });

  it("treats an absent field as absent, not as zero", () => {
    // A session logged with no intent recorded must not read as 0% and fall
    // below the trigger on the strength of a field nobody filled in.
    expect(triggersRecovery({ totalThrows: 45 })).toBe(true);
    expect(triggersRecovery({ intentPercent: null, totalThrows: 45 })).toBe(true);
    expect(triggersRecovery({})).toBe(false);
  });
});

describe("load tiers", () => {
  it("calls a competitive start heavy whatever the count", () => {
    expect(classifyThrowingLoadTier({ competitiveStart: true, gamePitches: 12 })).toBe("heavy");
  });

  it("is heavy at 60 pitches and above", () => {
    expect(classifyThrowingLoadTier({ gamePitches: 60 })).toBe("heavy");
    expect(classifyThrowingLoadTier({ gamePitches: 95 })).toBe("heavy");
    expect(classifyThrowingLoadTier({ gamePitches: 59 })).toBe("moderate");
  });

  it("is moderate from 30 to 59 pitches", () => {
    expect(classifyThrowingLoadTier({ gamePitches: 30 })).toBe("moderate");
    expect(classifyThrowingLoadTier({ gamePitches: 45 })).toBe("moderate");
  });

  it("is moderate for a full-intent bullpen however few pitches", () => {
    expect(classifyThrowingLoadTier({ totalThrows: 22, intentPercent: 100 })).toBe("moderate");
  });

  it("is light below 30 throws, or a bullpen at 70% or less", () => {
    expect(classifyThrowingLoadTier({ totalThrows: 20 })).toBe("light");
    expect(classifyThrowingLoadTier({ totalThrows: 40, intentPercent: 65 })).toBe("light");
  });

  it("returns nothing when the session says nothing", () => {
    expect(classifyThrowingLoadTier({})).toBeNull();
  });

  it("runs for the length the spec gives each tier", () => {
    expect(protocolLengthForTier("light")).toBe(2);
    expect(protocolLengthForTier("moderate")).toBe(4);
    expect(protocolLengthForTier("heavy")).toBe(5);
  });
});

describe("the throwing plan", () => {
  const heavy = buildThrowingRecoveryPlan({ tier: "heavy", outingDate: OUTING, bodyweightKg: 85 });

  it("runs five days for a heavy outing, because strength peaks at day 5", () => {
    expect(heavy.days).toHaveLength(5);
    expect(heavy.days.map((day) => day.dayOffset)).toEqual([0, 1, 2, 3, 4]);
  });

  it("puts each day on a real, consecutive date", () => {
    expect(heavy.days[0].date).toBe(OUTING);
    expect(heavy.days[4].date).toBe("2026-08-18");
  });

  it("stops a light protocol after day 1", () => {
    const light = buildThrowingRecoveryPlan({ tier: "light", outingDate: OUTING });
    expect(light.days).toHaveLength(2);
  });

  it("keeps heavy band work off day 0 and puts it on day 3", () => {
    const dayZero = heavy.days[0].blocks.map((block) => block.id);
    expect(dayZero).not.toContain("band-routine");
    expect(heavy.days[3].blocks.map((block) => block.id)).toContain("band-routine");
  });

  it("puts compression on within 30 minutes for 2 to 8 hours", () => {
    const compression = heavy.days[0].blocks.find((block) => block.id === "compression");
    expect(compression?.prescription).toContain("30 min");
    expect(compression?.prescription).toContain("2–8 h");
  });

  it("prescribes scapular strengthening on day 1", () => {
    expect(heavy.days[1].blocks.map((block) => block.id)).toContain("scap-strength");
  });

  it("annotates the day-2 range dip instead of flagging it", () => {
    expect(heavy.days[2].annotation).toMatch(/expected/i);
    expect(postScapularRangeAnnotation(2)).toMatch(/not a red flag/i);
    expect(postScapularRangeAnnotation(1)).toBeNull();
    expect(postScapularRangeAnnotation(4)).toBeNull();
  });

  it("carries the sleeper-stretch warning wherever it is prescribed", () => {
    const stretch = heavy.days[2].blocks.find((block) => block.id === "sleeper-stretch");
    expect(stretch?.caveat).toMatch(/2 h before throwing/i);
  });

  it("scales the feed to bodyweight, and states the range when there is none", () => {
    expect(heavy.days[0].blocks.find((b) => b.id === "feed")?.prescription).toBe(
      "26–34 g protein plus carbohydrate"
    );
    const unknown = buildThrowingRecoveryPlan({ tier: "heavy", outingDate: OUTING, bodyweightKg: null });
    expect(unknown.days[0].blocks.find((b) => b.id === "feed")?.prescription).toBe(
      "0.3–0.4 g/kg protein plus carbohydrate"
    );
  });

  it("marks heat optional and shows the split evidence", () => {
    const heat = heavy.days[0].blocks.find((block) => block.id === "heat");
    expect(heat?.optional).toBe(true);
    expect(heat?.caveat).toMatch(/4 positive, 4 null, 1 adverse/);
  });

  it("keeps the honest caveat on percussive massage", () => {
    const percussive = heavy.days[0].blocks.find((block) => block.id === "percussive");
    expect(percussive?.caveat).toMatch(/worse than ice at 48 h/i);
  });

  it("gives every block a prescription and a reason", () => {
    for (const day of heavy.days) {
      expect(day.blocks.length).toBeGreaterThan(0);
      for (const block of day.blocks) {
        expect(block.name.trim().length, block.id).toBeGreaterThan(0);
        expect(block.prescription.trim().length, block.id).toBeGreaterThan(0);
        expect(block.why.trim().length, block.id).toBeGreaterThan(0);
      }
    }
  });

  it("gives every block a distinct id", () => {
    const ids = heavy.days.flatMap((day) => day.blocks.map((block) => block.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("the sleeper stretch block", () => {
  it("is blocked inside two hours before throwing", () => {
    expect(PRE_THROW_STRETCH_BLOCK_HOURS).toBe(2);
    expect(isPosteriorStretchBlocked(0.5)).toBe(true);
    expect(isPosteriorStretchBlocked(1.9)).toBe(true);
  });

  it("is allowed at two hours and beyond", () => {
    expect(isPosteriorStretchBlocked(2)).toBe(false);
    expect(isPosteriorStretchBlocked(6)).toBe(false);
  });

  it("is allowed when there is no next throw to be inside of", () => {
    expect(isPosteriorStretchBlocked(null)).toBe(false);
  });
});

describe("the gym track", () => {
  const plan = buildGymRecoveryPlan({ sessionType: "hypertrophy", sessionDate: OUTING, bodyweightKg: 85 });

  it("exists at all, for every session type", () => {
    for (const sessionType of ["hypertrophy", "max_strength", "conditioning"] as const) {
      expect(buildGymRecoveryPlan({ sessionType, sessionDate: OUTING }).days.length).toBeGreaterThan(0);
    }
  });

  it("spreads protein across four feeds rather than one shake", () => {
    const protein = plan.days[0].blocks.find((block) => block.id === "protein-spread");
    expect(protein?.prescription).toMatch(/every ~3 h/);
    expect(protein?.prescription).toMatch(/not one large shake/);
  });

  it("permits heat with no timing restriction, which is the point of the no-cold build", () => {
    const heat = plan.days[0].blocks.find((block) => block.id === "heat-gym");
    expect(heat?.prescription).toMatch(/no timing restriction/i);
  });

  it("puts soft tissue on the day after, where the effect is largest", () => {
    expect(plan.days[1].blocks.map((block) => block.id)).toContain("soft-tissue-gym");
  });
});

describe("lifting and throwing on one day", () => {
  it("orders the sessions rather than gating modalities", () => {
    const sameDay = CONFLICT_RULES.find((rule) => rule.situation.includes("same day"));
    expect(sameDay?.rule).toMatch(/throw first, lift second/i);
  });

  it("counts protein per day, not per session", () => {
    const both = CONFLICT_RULES.find((rule) => rule.situation.includes("Both sessions"));
    expect(both?.rule).toMatch(/per day/i);
  });

  it("does not prescribe two compression periods", () => {
    const compression = CONFLICT_RULES.find((rule) => rule.situation.includes("Compression"));
    expect(compression?.rule).toMatch(/one garment period/i);
  });
});

describe("acute:chronic workload", () => {
  it("bands at 0.8 to 1.3", () => {
    expect(ACWR_BAND).toEqual([0.8, 1.3]);
    expect(acwrReading(100, 100)?.inBand).toBe(true);
    expect(acwrReading(80, 100)?.inBand).toBe(true);
    expect(acwrReading(130, 100)?.inBand).toBe(true);
  });

  it("reports outside the band without gating on it", () => {
    expect(acwrReading(150, 100)?.inBand).toBe(false);
    expect(acwrReading(150, 100)?.note).toMatch(/above/i);
    expect(acwrReading(50, 100)?.note).toMatch(/below/i);
  });

  it("returns nothing rather than dividing by an absent base", () => {
    expect(acwrReading(100, 0)).toBeNull();
    expect(acwrReading(100, null)).toBeNull();
    expect(acwrReading(null, 100)).toBeNull();
  });
});

describe("Pitch Smart rest", () => {
  it("accepts a next outing with enough calendar rest", () => {
    expect(checkPitchSmartRest({ lastOuting: "2026-08-14", nextOuting: "2026-08-19", requiredRestDays: 4 }).ok).toBe(
      true
    );
  });

  it("refuses one without, and says how short it is", () => {
    const check = checkPitchSmartRest({
      lastOuting: "2026-08-14",
      nextOuting: "2026-08-17",
      requiredRestDays: 4,
    });
    expect(check.ok).toBe(false);
    expect(check.problem).toContain("2 rest days");
  });

  it("refuses three consecutive days pitching", () => {
    const check = checkPitchSmartRest({
      lastOuting: "2026-08-15",
      nextOuting: "2026-08-16",
      requiredRestDays: 0,
      recentOutings: ["2026-08-14"],
    });
    expect(check.ok).toBe(false);
    expect(check.problem).toMatch(/three consecutive days/i);
  });

  it("refuses a next outing that is not after the last", () => {
    expect(
      checkPitchSmartRest({ lastOuting: "2026-08-14", nextOuting: "2026-08-14", requiredRestDays: 0 }).ok
    ).toBe(false);
  });
});

describe("the BFR block", () => {
  it("keeps the guardrail about a calibrated cuff", () => {
    expect(BFR_BLOCK.guardrail).toMatch(/calibrated cuff/i);
    expect(BFR_BLOCK.guardrail).toMatch(/no longer applies/i);
  });

  it("labels passive BFR experimental and keeps it out of the default plan", () => {
    expect(BFR_BLOCK.experimentalNote).toMatch(/experimental/i);
    expect(BFR_BLOCK.experimentalNote).toMatch(/not part of the default plan/i);
  });

  it("is not in the default throwing plan", () => {
    const plan = buildThrowingRecoveryPlan({ tier: "heavy", outingDate: OUTING });
    const ids = plan.days.flatMap((day) => day.blocks.map((block) => block.id));
    expect(ids).not.toContain("bfr");
  });
});

describe("every prescription is specific enough to act on", () => {
  const everyBlock = () => {
    const blocks = [];
    for (const tier of ["light", "moderate", "heavy"] as const) {
      for (const day of buildThrowingRecoveryPlan({ tier, outingDate: OUTING, bodyweightKg: 85 }).days) {
        blocks.push(...day.blocks);
      }
    }
    for (const sessionType of ["hypertrophy", "max_strength", "conditioning"] as const) {
      for (const day of buildGymRecoveryPlan({ sessionType, sessionDate: OUTING, bodyweightKg: 85 }).days) {
        blocks.push(...day.blocks);
      }
    }
    // One entry per block id — the same block repeats across tiers.
    return [...new Map(blocks.map((block) => [block.id, block])).values()];
  };

  it("gives a number to every block: reps, sets, minutes, grams or hours", () => {
    // "6–8 scapular movements, moderate-to-heavy load" is not something an
    // athlete can walk into a gym and do. Every block has to carry a dose.
    const dosed = /\d+\s*(×|x)\s*\d+|×\s*\d+|\d+\s*(reps?|sets?|min|s\b|h\b|g\b|ft\b|°)|\d+–\d+/i;
    for (const block of everyBlock()) {
      expect(block.prescription, `${block.id}: "${block.prescription}"`).toMatch(dosed);
    }
  });

  it("names the exercises in the two loaded blocks rather than counting them", () => {
    const blocks = new Map(everyBlock().map((block) => [block.id, block]));

    const scap = blocks.get("scap-strength")!.prescription;
    for (const movement of ["band row", "external rotation", "band W", "prone Y raise", "serratus wall slide"]) {
      expect(scap, movement).toContain(movement);
    }
    expect(scap).toMatch(/2 sets/);

    const bands = blocks.get("band-routine")!.prescription;
    for (const movement of ["forward arm circles", "horizontal abduction", "deceleration", "acceleration"]) {
      expect(bands, movement).toContain(movement);
    }
    expect(bands).toMatch(/10 reps/);
  });

  it("says how much throwing the re-load and the prime are", () => {
    const blocks = new Map(everyBlock().map((block) => [block.id, block]));
    expect(blocks.get("reload")!.prescription).toMatch(/25–35 throws/);
    expect(blocks.get("reload")!.prescription).toMatch(/15–20 pitch/);
    expect(blocks.get("prime")!.prescription).toMatch(/10–15 throws/);
  });

  it("says where the soft tissue and percussive work goes, not just for how long", () => {
    const blocks = new Map(everyBlock().map((block) => [block.id, block]));
    expect(blocks.get("percussive")!.prescription).toMatch(/forearm flexors/);
    expect(blocks.get("soft-tissue")!.prescription).toMatch(/lats/);
    expect(blocks.get("soft-tissue-gym")!.prescription).toMatch(/quads/);
  });
});

describe("citations", () => {
  it("names a source wherever a claim rests on one", () => {
    const plan = buildThrowingRecoveryPlan({ tier: "heavy", outingDate: OUTING });
    const cited = plan.days.flatMap((day) => day.blocks).filter((block) => block.citation);
    expect(cited.length).toBeGreaterThan(5);
    for (const block of cited) {
      expect(block.citation!.key.trim().length, block.id).toBeGreaterThan(0);
      expect(block.citation!.detail.trim().length, block.id).toBeGreaterThan(0);
    }
  });
});

describe("equipment the athlete actually owns", () => {
  const withKit = (equipment: readonly string[]) =>
    buildThrowingRecoveryPlan({
      tier: "heavy",
      outingDate: OUTING,
      bodyweightKg: 85,
      equipment: equipment as never,
    });

  it("prescribes the boots, cups and scraper he owns", () => {
    const plan = withKit(OWNED_EQUIPMENT);
    const ids = plan.days.flatMap((day) => day.blocks.map((block) => block.id));
    expect(ids).toContain("boots");
    expect(ids).toContain("boots-day1");
    expect(ids).toContain("scraper");
    // Cups are a tool inside the soft-tissue block, not an eleventh task on
    // the same tissue.
    const softTissue = plan.days[2].blocks.find((block) => block.id === "soft-tissue");
    expect(softTissue?.prescription).toMatch(/cups/i);
  });

  it("leaves out what he does not own rather than prescribing it anyway", () => {
    const plan = withKit(["compression_sleeve", "roller", "bands", "heat"]);
    const ids = plan.days.flatMap((day) => day.blocks.map((block) => block.id));
    expect(ids).not.toContain("boots");
    expect(ids).not.toContain("scraper");
    expect(ids).not.toContain("percussive");
    // What needs no equipment is untouched.
    expect(ids).toContain("feed");
    expect(ids).toContain("scap-strength");
  });

  it("keeps the boots honest about what they do", () => {
    const boots = withKit(OWNED_EQUIPMENT).days[0].blocks.find((block) => block.id === "boots");
    expect(boots?.prescription).toMatch(/20–30 min/);
    expect(boots?.prescription).toMatch(/80 mmHg/);
    // Small-to-moderate for soreness, trivial-to-small for function. The block
    // must not imply it restores strength.
    expect(boots?.why).toMatch(/trivial-to-small/i);
    expect(boots?.caveat).toMatch(/no better than massage/i);
  });

  it("keeps the scraper's claim to range of motion and nothing else", () => {
    const scraper = withKit(OWNED_EQUIPMENT).days[2].blocks.find((block) => block.id === "scraper");
    expect(scraper?.why).toMatch(/4\.94°/);
    expect(scraper?.why).toMatch(/adjunct/i);
    expect(scraper?.caveat).toMatch(/bruise/i);
  });

  it("says plainly how thin the cupping evidence is", () => {
    const softTissue = withKit(OWNED_EQUIPMENT).days[2].blocks.find((block) => block.id === "soft-tissue");
    expect(softTissue?.caveat).toMatch(/risk of bias/i);
    expect(softTissue?.caveat).toMatch(/no study has looked at cupping for muscle soreness/i);
    expect(softTissue?.caveat).toMatch(/marks are expected/i);
  });

  it("still gives every equipment block a dose", () => {
    for (const day of withKit(OWNED_EQUIPMENT).days) {
      for (const block of day.blocks) {
        if (!block.requires) continue;
        expect(block.prescription, block.id).toMatch(/\d/);
      }
    }
  });
});

/**
 * Both of these were constants until they turned out to be things that change:
 * kit gets bought, broken and lent out, and "moderate" means different efforts
 * to different throwers. Reading them from the workspace introduces a way for
 * stored rubbish to reach the plan, so the readers are the guard.
 */
describe("settings read from the workspace", () => {
  it("treats an unset kit as the default, not as owning nothing", () => {
    expect(readEquipment(undefined)).toEqual(OWNED_EQUIPMENT);
    expect(readEquipment(null)).toEqual(OWNED_EQUIPMENT);
    expect(readEquipment("cups")).toEqual(OWNED_EQUIPMENT);
  });

  it("honours an explicitly empty kit, because owning nothing is an answer", () => {
    expect(readEquipment([])).toEqual([]);
    const plan = buildThrowingRecoveryPlan({ tier: "heavy", outingDate: "2026-08-10", equipment: [] });
    for (const day of plan.days) {
      for (const block of day.blocks) expect(block.requires, block.id).toBeUndefined();
    }
    // And what is left is still a plan, not an empty list.
    expect(plan.days.every((day) => day.blocks.length > 0)).toBe(true);
  });

  it("drops kit it does not recognise, and de-duplicates", () => {
    expect(readEquipment(["cups", "cups", "ice_bath", 7, null])).toEqual(["cups"]);
  });

  it("keeps the blocks for kit that is owned and drops the rest", () => {
    const plan = buildThrowingRecoveryPlan({
      tier: "heavy",
      outingDate: "2026-08-10",
      equipment: ["compression_sleeve"],
    });
    const required = plan.days.flatMap((day) => day.blocks.map((block) => block.requires));
    expect(required.filter(Boolean)).toEqual(
      required.filter(Boolean).map(() => "compression_sleeve")
    );
    expect(required).toContain("compression_sleeve");
  });

  it("merges intent percentages over the defaults rather than replacing them", () => {
    expect(readIntentPercent(undefined)).toEqual(INTENT_PERCENT);
    expect(readIntentPercent({ moderate: 85 })).toEqual({ ...INTENT_PERCENT, moderate: 85 });
  });

  it("clamps an edit so the protocol cannot be switched off by typing", () => {
    const [floor, ceiling] = INTENT_PERCENT_RANGE;
    expect(readIntentPercent({ high: 0 }).high).toBe(floor);
    expect(readIntentPercent({ high: 999 }).high).toBe(ceiling);
    expect(readIntentPercent({ high: "not a number" }).high).toBe(INTENT_PERCENT.high);
    expect(readIntentPercent({ moderate: 82.4 }).moderate).toBe(82);
  });

  it("lets a raised 'moderate' start a protocol that the default would not", () => {
    // Under the throw-count trigger, so the intent reading is what decides it.
    const short = { totalThrows: 24 };
    const outings = [
      { date: "2026-08-10", load: { ...short, intentPercent: INTENT_PERCENT.moderate } },
    ];
    expect(recoveryForDay("2026-08-11", outings)).toBeNull();

    const raised = readIntentPercent({ moderate: 85 });
    const harder = [{ date: "2026-08-10", load: { ...short, intentPercent: raised.moderate } }];
    expect(recoveryForDay("2026-08-11", harder)).not.toBeNull();
  });

  it("and a lowered 'high' stops one the default would start", () => {
    const short = { totalThrows: 24 };
    const asIs = [{ date: "2026-08-10", load: { ...short, intentPercent: INTENT_PERCENT.high } }];
    expect(recoveryForDay("2026-08-11", asIs)).not.toBeNull();

    const eased = readIntentPercent({ high: 70 });
    const softer = [{ date: "2026-08-10", load: { ...short, intentPercent: eased.high } }];
    expect(recoveryForDay("2026-08-11", softer)).toBeNull();
  });

  it("names every piece of kit it can require", () => {
    const named = new Set(Object.keys(EQUIPMENT_LABELS));
    const plan = buildThrowingRecoveryPlan({ tier: "heavy", outingDate: "2026-08-10" });
    for (const day of plan.days) {
      for (const block of day.blocks) {
        if (block.requires) expect(named.has(block.requires), block.requires).toBe(true);
      }
    }
    for (const label of Object.values(EQUIPMENT_LABELS)) expect(label.trim().length).toBeGreaterThan(0);
  });
});
