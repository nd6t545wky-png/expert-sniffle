import {
  nonCompetitionSaturdaySession,
  standardSession,
  summerSlot,
} from "./programmeContent";
import type { Session, SessionTask, WeekPlan } from "./programmeSessions";

/**
 * The athlete's own week: which nights their team trains and which days they
 * play. Asked at sign-up.
 *
 * The programme was written around one athlete's week - club training Tuesday
 * and Thursday, games Friday and Sunday in summer, a Saturday game in winter.
 * Every day's session is a job relative to the games: the day after a game is
 * the arm's day off, the bullpen sits two days clear of the next game, the day
 * before a game is a light catch. So for anyone else the same jobs are laid
 * over their own game days, and each day's write-up is written for their week
 * rather than his.
 */
export interface WeeklySchedule {
  /** Weekdays with team training, 0 = Monday. */
  training: number[];
  /** Weekdays with games in the summer season. */
  games: number[];
  /** Weekdays with winter-ball games; empty when the athlete plays no winter ball. */
  winterGames: number[];
  /**
   * Set when `games` is this particular week's games, read off the team's
   * imported draw, rather than the athlete's usual days. A draw week with no
   * games is a bye.
   */
  fromDraw?: boolean;
  /**
   * With `fromDraw`, over the programme's Christmas break: the team's league
   * plays through Christmas, so the break is in season for them - game weeks
   * as normal, and a week without a game a bye rather than the off-season.
   */
  inSeason?: boolean;
}

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** The week the programme was written for. A schedule that matches it gets the programme untouched. */
export const PROGRAMME_WEEK: WeeklySchedule = { training: [1, 3], games: [4, 6], winterGames: [5] };

const days = (value: unknown): number[] | null =>
  Array.isArray(value)
    ? [...new Set(value.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort()
    : null;

/** The schedule stored on the profile, or null if the athlete has not answered yet. */
export function readSchedule(profile: unknown): WeeklySchedule | null {
  const raw = (profile && typeof profile === "object" ? (profile as Record<string, unknown>).schedule : null) as
    | Record<string, unknown>
    | null
    | undefined;
  if (!raw || typeof raw !== "object") return null;
  const training = days(raw.training);
  const games = days(raw.games);
  const winterGames = days(raw.winterGames) ?? [];
  if (!training || !games) return null;
  return { training, games, winterGames };
}

const same = (a: number[], b: number[]) => a.length === b.length && a.every((value, index) => value === b[index]);

/** "Tue & Thu", "Mon, Wed & Fri". */
export function dayList(list: number[], names: readonly string[] = DAY_SHORT): string {
  const labels = list.map((day) => names[day]);
  return labels.length <= 1 ? labels.join("") : `${labels.slice(0, -1).join(", ")} & ${labels[labels.length - 1]}`;
}

/** One line for the week: "Training Tue & Thu · games Sat". */
export function weekLine(schedule: WeeklySchedule, winter = false): string {
  const games = winter ? schedule.winterGames : schedule.games;
  const parts = [
    schedule.training.length ? `training ${dayList(schedule.training)}` : "no team training",
    games.length ? `${games.length === 1 ? "game" : "games"} ${dayList(games)}` : "no games",
  ];
  const line = parts.join(" · ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

export type DayRole = "game" | "between" | "pre-game" | "post-game" | "bullpen" | "free";

const wrap = (day: number) => ((day % 7) + 7) % 7;

/**
 * What each weekday is for, given the game days. The week wraps: Sunday's game
 * makes Monday the day after a game.
 */
export function dayRoles(games: number[]): DayRole[] | null {
  if (!games.length) return null;
  const isGame = (day: number) => games.includes(wrap(day));
  const roles: DayRole[] = DAY_NAMES.map((_, day) => {
    if (isGame(day)) return "game";
    if (isGame(day - 1) && isGame(day + 1)) return "between";
    if (isGame(day + 1)) return "pre-game";
    if (isGame(day - 1)) return "post-game";
    return "free";
  });
  // One bullpen between games: the free day furthest from a game on both
  // sides, and of those the one nearest the next game - two days clear of it,
  // as the programme has it.
  const distance = (day: number, step: 1 | -1) => {
    for (let n = 1; n <= 7; n += 1) if (isGame(day + step * n)) return n;
    return 7;
  };
  // Club nights do not move it: a bullpen can fall on a training night, and
  // the training overlay keeps it there alongside practice.
  const free = roles.map((role, day) => (role === "free" ? day : -1)).filter((day) => day >= 0);
  if (free.length) {
    const score = (day: number) => Math.min(distance(day, 1), distance(day, -1));
    const best = free.reduce((pick, day) => {
      const better = score(day) > score(pick) || (score(day) === score(pick) && distance(day, 1) < distance(pick, 1));
      return better ? day : pick;
    });
    roles[best] = "bullpen";
  }
  return roles;
}

/** The programme's summer weekday that does each job. */
function summerSlotFor(roles: DayRole[], day: number): number {
  const role = roles[day];
  if (role === "game") {
    // The first of a pair of games is the programme's Friday; a game with no
    // other game in the next two days is its Sunday, followed by the day off.
    return roles[wrap(day + 1)] === "between" || roles[wrap(day + 1)] === "game" ? 4 : 6;
  }
  return { between: 5, "pre-game": 3, "post-game": 0, bullpen: 2, free: 1 }[role];
}

/**
 * Weekday names in the programme's text, mapped to the athlete's week: the
 * programme's Friday is their first game, its Wednesday their bullpen day, and
 * so on. A name the athlete's week has no day for is left alone.
 */
function nameMap(roles: DayRole[], slots: number[], today: number, todaySlot: number): Map<string, string> {
  const map = new Map<string, string>();
  const firstDay = (slot: number) => slots.findIndex((candidate) => candidate === slot);
  for (let slot = 0; slot < 7; slot += 1) {
    const day = slot === todaySlot ? today : firstDay(slot);
    if (day >= 0) map.set(DAY_NAMES[slot], DAY_NAMES[day]);
  }
  // A single weekly game is the programme's Sunday; let "Friday" mean it too.
  if (!map.has("Friday") && map.has("Sunday")) map.set("Friday", map.get("Sunday")!);
  if (!map.has("Sunday") && map.has("Friday")) map.set("Sunday", map.get("Friday")!);
  return map;
}

const DAY_WORD = new RegExp(`\\b(${DAY_NAMES.join("|")})\\b`, "g");

function renameDays(value: unknown, map: Map<string, string>): unknown {
  if (typeof value === "string") return value.replace(DAY_WORD, (name) => map.get(name) ?? name);
  if (Array.isArray(value)) return value.map((inner) => renameDays(inner, map));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, key === "id" ? inner : renameDays(inner, map)])
    );
  }
  return value;
}

/** Task ids carry the weekday they were built for; keep them on the real day. */
function rehome(tasks: SessionTask[], slot: number, day: number): SessionTask[] {
  return tasks.map((task) => ({ ...task, id: String(task.id).replace(new RegExp(`^(w\\d+)-d${slot}(?=-|$)`), `$1-d${day}`) }));
}

function nextGame(roles: DayRole[], day: number): number {
  for (let n = 1; n <= 7; n += 1) if (roles[wrap(day + n)] === "game") return wrap(day + n);
  return day;
}
function lastGame(roles: DayRole[], day: number): number {
  for (let n = 1; n <= 7; n += 1) if (roles[wrap(day - n)] === "game") return wrap(day - n);
  return day;
}

const TEAM_STAGES = new Set(["Team Practice", "Team Throwing"]);

/**
 * A week the team's draw has no game in. The arm still needs its one bullpen
 * and the week its two gym days; everything else is a catch or team training.
 */
function byeWeekDay(week: WeekPlan, day: number, schedule: WeeklySchedule): Session {
  const slot = day === 0 ? 0 : day === 2 ? 2 : 1;
  const built = summerSlot(week, day, slot) as Session;
  const training = schedule.training.includes(day);
  let tasks = built.tasks.filter((task) => !/after Sunday competition/i.test(String(task.stageDescription)));
  if (!training) {
    tasks = tasks
      .filter((task) => task.stageTitle !== "Team Practice")
      .map((task) => (TEAM_STAGES.has(task.stageTitle) ? { ...task, stageTitle: "Throw" } : task));
  }
  const name = DAY_NAMES[day];
  const job =
    slot === 0
      ? { title: "Strength Maintenance", text: "The lighter of the week's two gym days, with no throwing." }
      : slot === 2
        ? { title: "Bullpen + Whole-Body Strength", text: "The week's bullpen keeps the arm on its rhythm, then the heavier gym session." }
        : training
          ? { title: "Team Training", text: "Team training. No extra throwing beyond what practice asks." }
          : { title: "Recovery Catch", text: "An optional easy catch if the arm wants it." };
  return {
    ...built,
    title: `${name} · ${job.title}`,
    description: `No game for your team this week. ${job.text}`,
    tasks: rehome(renameDays(tasks, new Map([[DAY_NAMES[slot], name]])) as SessionTask[], slot, day),
  };
}

/** A summer-season day laid over the athlete's own week. */
export function personalSummerDay(week: WeekPlan, day: number, schedule: WeeklySchedule): Session | null {
  const roles = dayRoles(schedule.games);
  if (!roles) return schedule.fromDraw ? byeWeekDay(week, day, schedule) : null;
  const slots = roles.map((_, index) => summerSlotFor(roles, index));
  const slot = slots[day];
  const firstGame = slots.findIndex((candidate) => candidate === 4);
  const built = summerSlot(week, day, slot, firstGame >= 0 ? firstGame : undefined) as Session;
  const map = nameMap(roles, slots, day, slot);
  const training = schedule.training.includes(day);
  const role = roles[day];
  const name = DAY_NAMES[day];
  const next = DAY_NAMES[nextGame(roles, day)];
  const last = DAY_NAMES[lastGame(roles, day)];

  let tasks = renameDays(built.tasks, map) as SessionTask[];
  // The programme's Tuesday and Thursday are club nights. On the athlete's
  // own week that is only true if their team trains that night; otherwise the
  // catch stays and the practice goes.
  if (!training) {
    tasks = tasks
      .filter((task) => task.stageTitle !== "Team Practice")
      .map((task) => (TEAM_STAGES.has(task.stageTitle) ? { ...task, stageTitle: "Throw" } : task));
  }

  const job: Record<DayRole, { title: string; text: string }> = {
    game: {
      title: "Game Day",
      text:
        slot === 4
          ? `Game day, with another game close behind it. How much you pitch today decides whether tomorrow is recovery or a primer.`
          : `Game day. Tomorrow is the arm's day off.`,
    },
    between: {
      title: String(renameDays(built.title, map)).split(" · ")[1] ?? "Between games",
      text: `Between ${last}'s game and ${next}'s. If you pitched yesterday this is recovery; if you did not, a short primer for ${next}.`,
    },
    "pre-game": {
      title: training ? "Team Training" : "Light Catch",
      text: `The day before ${next}'s game: a light catch only - no gym and no microdose.${training ? " Keep extra throwing at practice low." : ""}`,
    },
    "post-game": {
      title: "Recovery + Strength Maintenance",
      text: `The day after ${last}'s game is the arm's day off: no throwing. The gym is maintenance only - single-leg work, pulling and the posterior chain, no hinge and no pressing.`,
    },
    bullpen: {
      title: "Bullpen + Whole-Body Strength",
      text: `Bullpen day - the week's one throwing session between games, ${
        last === next ? `well clear of ${next}'s game on either side` : `clear of ${last}'s game and before ${next}'s`
      }. The bullpen goes first while the arm is fresh, then the heavier of the week's gym sessions.`,
    },
    free: {
      title: training ? "Team Training" : "Recovery Catch",
      text: training
        ? `Team training, with no game either side. No extra throwing beyond what practice asks - ${next}'s game is the week's work.`
        : `No game either side and no team training: an optional recovery catch if the arm wants it.`,
    },
  };

  const base = {
    ...built,
    title: `${name} · ${job[role].title}`,
    description: `Your week: ${weekLine(schedule).charAt(0).toLowerCase()}${weekLine(schedule).slice(1)}. ${job[role].text}`,
    tasks: rehome(tasks, slot, day),
    ...(role === "pre-game" || role === "between" ? { preGame: true } : {}),
    ...(role === "post-game" ? { postGame: true } : {}),
    ...(schedule.games.length >= 2 ? { twoGameWeek: true } : {}),
  };
  return base;
}

/** Winter weeks have one game: the programme's Saturday. Move the whole week with it. */
export function personalWinterDay(week: WeekPlan, day: number, schedule: WeeklySchedule): Session {
  if (!schedule.winterGames.length) {
    // No winter ball: Saturday is a development day rather than a game.
    if (day !== 5) return standardSession(week, day) as Session;
    const built = nonCompetitionSaturdaySession(week) as Session;
    return {
      ...built,
      description: `No winter ball on your week, so there is no game to prepare for. ${built.description}`,
    };
  }
  const offset = schedule.winterGames[0] - 5;
  const slot = wrap(day - offset);
  const built = standardSession(week, slot) as Session;
  if (offset === 0) return built;
  const map = new Map<string, string>(DAY_NAMES.map((name, index) => [name, DAY_NAMES[wrap(index + offset)]]));
  const renamed = renameDays(built, map) as Session;
  return {
    ...renamed,
    description: `Your week: winter game ${DAY_NAMES[schedule.winterGames[0]]}. ${renamed.description}`,
    tasks: rehome(renamed.tasks, slot, day),
  };
}

export function isProgrammeSummerWeek(schedule: WeeklySchedule): boolean {
  return (
    !schedule.fromDraw && same(schedule.games, PROGRAMME_WEEK.games) && same(schedule.training, PROGRAMME_WEEK.training)
  );
}
export function isProgrammeWinterWeek(schedule: WeeklySchedule): boolean {
  return same(schedule.winterGames.slice(0, 1), PROGRAMME_WEEK.winterGames);
}
