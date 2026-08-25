import { IsoDate } from "./state";
import { Session, SessionTask } from "./programmeSessions";

/**
 * Club training nights, folded into the plan.
 *
 * The programme was written around one club at a time: winter weeks assume the
 * athlete trains alone Tuesday and Thursday, summer weeks assume Coomera Cubs
 * practice on both. Reality does not switch over on a phase boundary — Cubs
 * training started on Tuesdays part-way through the FNCBA winter season, which
 * the winter plan has no idea about.
 *
 * Left alone, that Tuesday reads: 2 × 10 m plus 3 × 20 m of near-maximal
 * running, a plyo ladder, and **45–55 command throws** — and then the athlete
 * goes to a full club practice and throws again. Eighty-five to a hundred and
 * fifteen throws on the day before the week's velocity day, from a plan that
 * believes it prescribed fifty.
 *
 * So a training night replaces the solo throwing rather than adding to it. The
 * replacement is the programme's own summer wording, verbatim — "40–60 throws
 * · distance and intensity set by team plan" — because that is precisely the
 * situation it was written for, and inventing a second phrasing for the same
 * thing would just be a second thing to keep in step.
 *
 * ## Why this is a setting and not a constant
 *
 * Club schedules move. The athlete has said plainly that the app should adapt
 * rather than require an edit here, so the training nights live in saved state
 * and the default only reflects what is true today: Tuesdays, from the week
 * they started. Changing the night is a tap, not a deploy.
 */

/** Weekday indices, matching the programme: 0 is Monday. */
export const WEEKDAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export interface TeamTraining {
  /** Weekdays carrying club training, 0 = Monday. */
  days: number[];
  /** The date it started. Days before this are left as the programme wrote them. */
  from: IsoDate;
  /** Which club, for the wording on the day. */
  club: string;
}

/**
 * What is true now.
 *
 * Coomera Cubs training began on Tuesdays in the week of 24 August 2026, part
 * way through the winter season. This is a default, not a constant: it is what
 * the settings open on, and the athlete can change it without touching code.
 */
export const DEFAULT_TEAM_TRAINING: TeamTraining = {
  days: [1],
  from: "2026-08-25" as IsoDate,
  club: "Coomera Cubs",
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Read the setting out of synced state, defensively. */
export function readTeamTraining(value: unknown): TeamTraining {
  if (typeof value !== "object" || value === null) return DEFAULT_TEAM_TRAINING;
  const raw = value as Partial<Record<keyof TeamTraining, unknown>>;

  const days = Array.isArray(raw.days)
    ? [...new Set(raw.days.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort()
    : DEFAULT_TEAM_TRAINING.days;
  const from = typeof raw.from === "string" && ISO.test(raw.from) ? (raw.from as IsoDate) : DEFAULT_TEAM_TRAINING.from;
  const club = typeof raw.club === "string" && raw.club.trim() ? raw.club.trim() : DEFAULT_TEAM_TRAINING.club;

  return { days, from, club };
}

/** Whether a given weekday, on a given date, is a club training night. */
export function isTrainingNight(settings: TeamTraining, day: number | null, date: IsoDate): boolean {
  if (day === null) return false;
  if (date < settings.from) return false;
  return settings.days.includes(day);
}

// --- Applying it ---------------------------------------------------------------

/** The stage holding the day's own throwing, which a training night replaces. */
const SOLO_THROW_STAGE = "Throw";
/** Stages the programme already uses when practice is on the plan. */
const TEAM_THROW_STAGE = "Team Throwing";
const TEAM_PRACTICE_STAGE = "Team Practice";

/** The speed set, which is trimmed rather than removed. */
const ACCELERATION = /acceleration quality/i;

function teamThrowingTask(prefix: string, stage: number, club: string): SessionTask {
  return {
    id: `${prefix}-team-throw`,
    stage,
    stageTitle: TEAM_THROW_STAGE,
    stageDescription: "Record team throwing and any mound work accurately.",
    name: `${club} practice throwing`,
    prescription: "40–60 throws · distance and intensity set by team plan",
    cue: "This replaces the solo command set rather than sitting in front of it — the throws you make at practice are the day's throws. Count them; a practice nobody counted is how a week's workload goes missing.",
    setup: "Warm up as you would for your own session before joining the team's throwing.",
    execution:
      "Take the team's assigned work. If the session runs long or the intensity climbs, stop at the top of the range rather than matching whoever is throwing beside you.",
    rest: "Team rhythm.",
    stop:
      "Stop for arm pain, and report it on the plan. Tomorrow is the week's highest-intent throwing day and it is built on this one going well.",
  };
}

function teamPracticeTask(prefix: string, stage: number, club: string): SessionTask {
  return {
    id: `${prefix}-team-practice`,
    stage,
    stageTitle: TEAM_PRACTICE_STAGE,
    stageDescription: "Practice volume includes fielding, conditioning and any bullpen work.",
    name: `Complete ${club} training`,
    prescription: "Complete assigned baseball work · record session duration and RPE",
    cue: "Log the duration and how hard it felt. Practice is real workload, and a week that does not count it will happily prescribe a hard Wednesday on top of it.",
    setup: "Nothing to set up — this is the club session.",
    execution: "Take part as assigned. Any extra bullpen counts as throwing and belongs in the workload log.",
    rest: "As the session runs.",
    stop: "Stop for pain, and report it rather than finishing the drill.",
  };
}

/**
 * Rename the day, because the old name is now wrong.
 *
 * "Tuesday · Command + Acceleration" describes a session whose command set has
 * just been replaced by a club practice. The banner and the description both
 * say what happened, but the heading is the largest text on the page and it
 * would still be naming work that is not there.
 *
 * Only the first descriptor changes — the acceleration work survives and stays
 * in the title. A title this cannot parse is left alone rather than mangled.
 */
function retitle(title: string): string {
  const [weekday, rest] = title.split(" · ");
  if (!rest) return title;
  const parts = rest.split(" + ");
  parts[0] = "Club training";
  return `${weekday} · ${parts.join(" + ")}`;
}

/**
 * Fold a club training night into a day the programme wrote as a solo session.
 *
 * A day that already carries team practice — the summer weeks, which were
 * written around it — is left completely alone. Adding a second practice to a
 * plan that already has one is the failure this exists to prevent, in the
 * other direction.
 */
export function applyTeamTraining(
  session: Session,
  options: { day: number | null; date: IsoDate; settings: TeamTraining }
): { session: Session; note: string | null } {
  const { day, date, settings } = options;
  const tonight = isTrainingNight(settings, day, date);
  const yesterdayWasTraining =
    day !== null && day > 0 && settings.days.includes(day - 1) && date >= settings.from;

  const tasks = [...session.tasks];

  // A day after a training night is a day the plan believes was lighter than
  // it was. That is worth saying on the high-intent work, and it is worth
  // saying even on a day that has no practice of its own.
  if (!tonight && yesterdayWasTraining) {
    let annotated = false;
    const noted = tasks.map((task) => {
      if (annotated || !/pulldown|velocity day|high-intent/i.test(String(task.name))) return task;
      annotated = true;
      const sentence = `${settings.club} trained last night, so today follows a practice the original plan did not know about — if the arm is not fresh, this is the set to cut rather than push through.`;
      const cue = String(task.cue ?? "");
      return cue.includes(sentence) ? task : { ...task, cue: `${cue} ${sentence}`.trim() };
    });
    return {
      session: { ...session, tasks: noted },
      note: annotated ? `Follows ${settings.club} training.` : null,
    };
  }

  if (!tonight) return { session, note: null };

  // Already a practice day in the programme's own eyes.
  if (tasks.some((task) => task.stageTitle === TEAM_PRACTICE_STAGE)) {
    return { session, note: null };
  }

  const prefix = String(tasks[0]?.id ?? "day").split("-").slice(0, 2).join("-");
  const soloThrows = tasks.filter((task) => task.stageTitle === SOLO_THROW_STAGE);

  // Nothing to swap and nothing to protect. A rest day with a training night
  // on it is a contradiction the athlete should resolve, not one to paper over.
  if (soloThrows.length === 0) return { session, note: null };

  const throwStage = Number(soloThrows[0].stage);
  const replaced = tasks.filter((task) => task.stageTitle !== SOLO_THROW_STAGE);
  const insertAt = replaced.findIndex((task) => Number(task.stage) > throwStage);

  // The practice block goes exactly where the solo throwing was, so the day
  // still reads warm-up → speed → throwing → arm care.
  const additions = [
    teamThrowingTask(prefix, throwStage, settings.club),
    teamPracticeTask(prefix, throwStage + 1, settings.club),
  ];
  replaced.splice(insertAt === -1 ? replaced.length : insertAt, 0, ...additions);

  // The speed set is kept — it is the week's only true acceleration exposure
  // and eighty metres of it is not what makes this day hard — but it loses a
  // rep, because practice brings running of its own and the hamstring does not
  // care which session it happened in.
  const trimmed = replaced.map((task) => {
    if (!ACCELERATION.test(String(task.name))) return task;
    const prescription = String(task.prescription).replace(/3 × 20 m/, "2 × 20 m");
    if (prescription === task.prescription) return task;
    return {
      ...task,
      prescription,
      cue: `${task.cue} One rep fewer than the plan wrote, because ${settings.club} training is on tonight and it brings running of its own.`,
    };
  });

  const dropped = soloThrows.map((task) => String(task.name)).join(", ");
  return {
    session: {
      ...session,
      title: retitle(String(session.title)),
      tasks: trimmed,
      description: `${session.description} ${settings.club} training is on tonight, so practice throwing replaces the solo set.`.trim(),
    },
    note: `${settings.club} training tonight — ${dropped} is replaced by practice throwing, not added to it.`,
  };
}
