/**
 * What an Apple Fitness upload may contain.
 *
 * Apple keeps Health and Fitness data on the phone and watch. There is no
 * cloud API, no account to connect and nothing to OAuth against — the only way
 * these numbers reach a server is if the phone pushes them, which in practice
 * means a Shortcut posting JSON. That makes this table the whole contract.
 *
 * It lives here, in one place, because it is used twice: the Worker validates
 * against it, and the setup instructions are generated from it. Two hand-kept
 * lists would drift, and the failure mode is silent — the athlete builds a
 * Shortcut from a documented name the Worker no longer accepts, gets a 400 it
 * never shows them, and concludes the ring is not syncing.
 *
 * Each field carries a few spellings on purpose. A Shortcut dictionary is
 * typed by hand, so "activeEnergy" and "activeCalories" both arriving is the
 * normal case rather than an edge one.
 */

export interface AppleField {
  /** The name stored, and the first one the instructions recommend. */
  id: string;
  /** Other spellings accepted, so a near-miss still uploads. */
  aliases: string[];
  /** Plausible range. Anything outside it is treated as absent. */
  min: number;
  max: number;
  /** What to put in it, in the words Apple's own Health app uses. */
  describe: string;
  /** True for the three Apple Fitness rings, which the setup leads with. */
  ring?: boolean;
}

export const APPLE_FIELDS: AppleField[] = [
  {
    id: "activeCalories",
    aliases: ["activeEnergy", "activeEnergyBurned", "move"],
    min: 0,
    max: 20_000,
    describe: "Active Energy, in kilocalories — the Move ring",
    ring: true,
  },
  {
    id: "exerciseMinutes",
    aliases: ["exercise", "appleExerciseTime"],
    min: 0,
    max: 1440,
    describe: "Exercise Minutes — the Exercise ring",
    ring: true,
  },
  {
    id: "standHours",
    aliases: ["stand", "appleStandHours"],
    min: 0,
    max: 24,
    describe: "Stand Hours — the Stand ring",
    ring: true,
  },
  { id: "steps", aliases: ["stepCount"], min: 0, max: 200_000, describe: "Step Count" },
  {
    id: "workoutCount",
    aliases: ["workouts"],
    min: 0,
    max: 100,
    describe: "How many workouts were recorded",
  },
  {
    id: "totalCalories",
    aliases: ["totalEnergy", "totalEnergyBurned"],
    min: 0,
    max: 30_000,
    describe: "Total Energy, active plus resting, in kilocalories",
  },
  {
    id: "restingHeartRate",
    aliases: ["restingHR", "rhr"],
    min: 20,
    max: 240,
    describe: "Resting Heart Rate, beats per minute",
  },
  {
    id: "hrvMs",
    aliases: ["hrv", "heartRateVariability"],
    min: 0,
    max: 500,
    describe: "Heart Rate Variability (SDNN), in milliseconds",
  },
  { id: "sleepHours", aliases: ["sleep", "timeAsleep"], min: 0, max: 24, describe: "Time asleep, in hours" },
  {
    id: "bodyweightKg",
    aliases: ["bodyweight", "weight", "weightKg"],
    min: 35,
    max: 250,
    describe: "Weight, in kilograms",
  },
  {
    id: "spo2Average",
    aliases: ["spo2", "bloodOxygen", "oxygenSaturation"],
    min: 0,
    max: 100,
    describe: "Blood Oxygen, as a percentage",
  },
  {
    id: "respiratoryRate",
    aliases: ["respiratory", "breathingRate"],
    min: 0,
    max: 60,
    describe: "Respiratory Rate, breaths per minute",
  },
  { id: "vo2Max", aliases: ["cardioFitness"], min: 0, max: 100, describe: "Cardio Fitness" },
];

function inRange(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

/**
 * Read an upload into the fields the app stores.
 *
 * Names are matched without regard to case. Someone building a Shortcut by
 * hand types "ActiveCalories" as readily as "activeCalories", and a
 * case-sensitive match would reject it with a 400 the phone never shows them —
 * which reads exactly like the ring not syncing.
 *
 * A field the payload did not carry is `null`, never zero: a Shortcut that
 * omits Stand Hours has not reported zero stand hours, and storing it as zero
 * would put a ring in the history that was never measured.
 */
export function readApplePayload(body: unknown): Record<string, number | null> {
  const source =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};

  const byLowerName = new Map<string, unknown>();
  for (const [key, value] of Object.entries(source)) {
    byLowerName.set(key.toLowerCase(), value);
  }

  const out: Record<string, number | null> = {};
  for (const field of APPLE_FIELDS) {
    let value: number | null = null;
    for (const name of [field.id, ...field.aliases]) {
      value = inRange(byLowerName.get(name.toLowerCase()), field.min, field.max);
      if (value !== null) break;
    }
    out[field.id] = value;
  }
  return out;
}

/** True when the upload carried nothing this app can use. */
export function isEmptyPayload(read: Record<string, number | null>): boolean {
  return Object.values(read).every((value) => value === null);
}

/** The fields an upload actually carried, for the reply and the UI. */
export function suppliedFields(read: Record<string, number | null>): string[] {
  return Object.entries(read)
    .filter(([, value]) => value !== null)
    .map(([name]) => name);
}
