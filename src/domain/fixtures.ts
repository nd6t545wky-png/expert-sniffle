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

/** What is on, on a given day. Null on the great majority of days. */
export function fixtureOn(date: IsoDate): Fixture | null {
  return FIXTURES.find((fixture) => fixture.date === date) ?? null;
}

/**
 * Fixtures from today forward, soonest first.
 *
 * Today counts as upcoming: on a game day the next fixture is the one being
 * played, not the one next week.
 */
export function upcomingFixtures(today: IsoDate, limit = FIXTURES.length): Fixture[] {
  return FIXTURES.filter((fixture) => fixture.date >= today)
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
