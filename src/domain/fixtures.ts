/**
 * The season's fixtures.
 *
 * These dates existed nowhere in this repository. They were read out of the
 * v61 build that was deployed over it — the last thing in that archive that
 * this codebase did not already have in some form, which is why it was worth
 * recovering before the archive went.
 *
 * They are a *provenance-labelled* list, not a truth. Eight of them were
 * marked in that build as the official FNCBA Division 1 draw; one was marked
 * as supplied by the athlete. Both labels travel with the fixture and are
 * shown, because a draw can be rescheduled and a date read out of a bundle is
 * a copy of a copy. Nothing in the programme is driven off these — they are
 * shown against the plan so the athlete can see a clash, not used to move a
 * session on their own.
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

export const FIXTURES: readonly Fixture[] = Object.freeze([
  ...FNCBA_ROUNDS.map(([round, date]) => ({
    id: `fncba-2026-r${round}`,
    date,
    team: "Norths",
    label: `FNCBA Division 1 Round ${round}`,
    source: "official" as const,
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
 * The built-in list is eight rounds recovered from an old build, and it stops
 * at Round 19. Two things it cannot know: a finals series, and any draw
 * published after that build was made. Neither league publishes anything this
 * app can read — the FNCBA draw lives in a TeamApp calendar and the Cubs'
 * 2026/27 fixtures are not out — so the only honest source for the rest of the
 * season is the athlete.
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
 * A finals series is exactly the case it gets wrong: the built-in draw stops
 * at Round 19, so the week a semi-final is played is a week the app has
 * planned as rest. It cannot detect that on its own — there is nothing to
 * detect until someone enters the game — but once the fixture is in, saying so
 * is the least it can do.
 *
 * Deliberately a warning rather than a re-phasing. Moving the whole back half
 * of the year because one date was typed in is not a decision this should make
 * unasked; the athlete can see the clash and choose.
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
    message: `${fixture.label} is on this week, but the programme has these weeks as “${week.phaseName}” — planned with no game in them. Throwing volume, intent and the gym are all set for a week off. Check this before training it as written.`,
  };
}
