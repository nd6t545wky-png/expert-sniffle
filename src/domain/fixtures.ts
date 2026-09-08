/**
 * The season's fixtures.
 *
 * These dates existed nowhere in this repository. They were read out of the
 * v61 build that was deployed over it — the last thing in that archive that
 * this codebase did not already have in some form, which is why it was worth
 * recovering before the archive went.
 *
 * They are a *provenance-labelled* list, not a truth. Eight of them were
 * marked in that build as the official FNCBA Division 1 draw; the rest — the
 * Cubs opener and the two semi-finals — came from the athlete. Both labels
 * travel with the fixture and are shown, because a draw can be rescheduled and
 * a date read out of a bundle is a copy of a copy. Nothing in the programme is
 * driven off these — they are shown against the plan so the athlete can see a
 * clash, not used to move a session on their own.
 */

import { IsoDate } from "./state";

export type FixtureSource = "official" | "athlete-provided";

export interface Fixture {
  id: string;
  date: IsoDate;
  /** The club this fixture is for. */
  team: string;
  label: string;
  source: FixtureSource;
}

/** FNCBA Division 1, rounds 12 to 19. */
const FNCBA_ROUNDS: Array<[round: number, date: IsoDate]> = [
  [12, "2026-07-18"],
  [13, "2026-07-25"],
  [14, "2026-08-01"],
  [15, "2026-08-08"],
  [16, "2026-08-15"],
  [17, "2026-08-22"],
  [18, "2026-08-29"],
  [19, "2026-09-05"],
];

/**
 * The semi-finals, as the athlete gave them.
 *
 * The recovered draw stops at Round 19 on Saturday 5 September; these are the
 * two games the weekend after it, against the Redbirds. They are here rather
 * than in the entered list because they came from the athlete directly, and
 * they carry the athlete-provided label for the same reason the Cubs opener
 * does — a date said out loud is not the published draw.
 *
 * They land in a week the phase table has as an unload, which is not an error
 * on either side: the programme was built assuming the season ended at Round
 * 19. `scheduleClash` will say so, which is the whole point of it.
 */
const FNCBA_SEMIS: Array<[game: number, date: IsoDate]> = [
  [1, "2026-09-11"],
  [2, "2026-09-12"],
];

export const FIXTURES: readonly Fixture[] = Object.freeze([
  ...FNCBA_ROUNDS.map(([round, date]) => ({
    id: `fncba-2026-r${round}`,
    date,
    team: "Norths",
    label: `FNCBA Division 1 Round ${round}`,
    source: "official" as const,
  })),
  ...FNCBA_SEMIS.map(([game, date]) => ({
    id: `fncba-2026-semi-${game}`,
    date,
    team: "Norths",
    label: `FNCBA Division 1 semi-final ${game} vs Redbirds`,
    source: "athlete-provided" as const,
  })),
  {
    id: "coomera-cubs-2026-10-02",
    date: "2026-10-02",
    team: "Coomera Cubs",
    label: "Coomera Cubs opening game",
    source: "athlete-provided" as const,
  },
]);

// --- What the athlete adds --------------------------------------------------

/**
 * Fixtures the athlete enters, merged over the built-in list.
 *
 * The recovered rounds stop at Round 19, and the two things beyond it — a
 * finals series, and any draw published after that build was made — are things
 * only the athlete can supply. Neither league publishes anything this app can
 * read: the FNCBA draw lives in a TeamApp calendar and the Cubs' 2026/27
 * fixtures are not out.
 *
 * Some of what the athlete has said is already in the built-in list above,
 * because they said it to whoever was editing this file rather than typing it
 * into the app. This is the path for everything after that, and for correcting
 * any of it — an entry here with the same id replaces the built-in one.
 *
 * They are merged, not replaced: the recovered rounds keep their "official"
 * label, an entered game says plainly that it came from the athlete, and both
 * are shown with their provenance because a date typed on a phone and a date
 * read out of a bundle are different kinds of fact.
 */
export function readAthleteFixtures(value: unknown): Fixture[] {
  if (!Array.isArray(value)) return [];
  const out: Fixture[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const raw = entry as Record<string, unknown>;
    const date = typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : null;
    if (!date) continue;
    const id = typeof raw.id === "string" && raw.id ? raw.id : `athlete-${date}`;
    out.push({
      id,
      date: date as IsoDate,
      team: typeof raw.team === "string" && raw.team.trim() ? raw.team.trim() : "My team",
      label: typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : "Game",
      source: "athlete-provided",
    });
  }
  // Last one wins on a duplicate id, so editing an entry replaces it.
  return [...new Map(out.map((fixture) => [fixture.id, fixture])).values()];
}

/** The built-in draw plus whatever the athlete has entered, in date order. */
export function allFixtures(athlete: readonly Fixture[] = []): Fixture[] {
  const merged = new Map<string, Fixture>();
  for (const fixture of [...FIXTURES, ...athlete]) merged.set(fixture.id, fixture);
  return [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Every fixture inside a date range, inclusive. */
export function fixturesBetween(from: IsoDate, to: IsoDate, fixtures: readonly Fixture[]): Fixture[] {
  return fixtures.filter((fixture) => fixture.date >= from && fixture.date <= to);
}

/** What is on, on a given day. Null on the great majority of days. */
export function fixtureOn(date: IsoDate, fixtures: readonly Fixture[] = FIXTURES): Fixture | null {
  return fixtures.find((fixture) => fixture.date === date) ?? null;
}

/**
 * Fixtures from today forward, soonest first.
 *
 * Today counts as upcoming: on a game day the next fixture is the one being
 * played, not the one next week.
 */
export function upcomingFixtures(
  today: IsoDate,
  limit = FIXTURES.length,
  fixtures: readonly Fixture[] = FIXTURES
): Fixture[] {
  return fixtures
    .filter((fixture) => fixture.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, Math.max(0, limit));
}

/** Whole days from `today` to the fixture. Negative once it has passed. */
export function daysUntil(today: IsoDate, fixture: Fixture): number {
  const from = Date.parse(`${today}T00:00:00.000Z`);
  const to = Date.parse(`${fixture.date}T00:00:00.000Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return Number.NaN;
  return Math.round((to - from) / 86_400_000);
}

// --- When the calendar and the programme disagree ----------------------------

/**
 * A game in a week the programme planned as having none.
 *
 * The phase table is fixed at fifty-two weeks and it puts a two-week unload
 * immediately after the last round it knows about — week 9 drops throwing
 * volume 45–55%, removes pulldowns and caps plyo intent at the recovery band.
 * That is right if the season ended, and badly wrong if it did not.
 *
 * A finals series is exactly the case it gets wrong: the recovered draw stops
 * at Round 19, so the week a semi-final is played is a week the app has
 * planned as rest.
 *
 * Two of the three things that used to be wrong about it now take care of
 * themselves. `buildSession` reads the fixture list and builds a game day
 * where there is a game, whatever the phase table guessed; and `velocityPolicy`
 * stops applying the unload's intent ceiling to a week that holds one, because
 * a taper cuts volume and holds intensity while an unload cuts both.
 *
 * What is left is the volume, and it is left on purpose. The reduced week is
 * 45–55% down on throwing, which happens to sit inside the band the tapering
 * meta-analysis reports as optimal — so for a week with a final in it the
 * volume is plausibly right already, and cutting or raising it is a judgement
 * about this athlete's finals series rather than something to derive from a
 * date. The gym is the same: week 9 is an unload and the athlete may well want
 * it to stay one.
 *
 * So the warning stays, and now says the narrower true thing: the day is
 * handled, the intent is handled, and the volume is still the phase table's.
 */
export interface ScheduleClash {
  fixture: Fixture;
  /** What the programme thinks the week is for. */
  phase: string;
  message: string;
}

/** Phases that assume no league game at all. */
const NO_GAME_PHASES = ["transition", "transition_summer", "preseason", "summer_break"];

export function scheduleClash(
  week: { start: IsoDate; end: IsoDate; phaseId: string; phaseName: string },
  fixtures: readonly Fixture[]
): ScheduleClash | null {
  if (!NO_GAME_PHASES.includes(week.phaseId)) return null;
  const [fixture] = fixturesBetween(week.start, week.end, fixtures);
  if (!fixture) return null;
  return {
    fixture,
    phase: week.phaseName,
    message: `${fixture.label} is on this week, and the programme has these weeks as “${week.phaseName}” — planned with no game in them. The game day is built as a game day, and the intent cap that unload put on the days around it has been lifted, because a taper holds intensity where an unload drops it. Throwing volume and the gym are still set for a week off, which may be right for a finals week and is your call. Check the build-up before training it as written.`,
  };
}
