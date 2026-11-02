import type { Session, SessionTask, WeekPlan } from "./programmeSessions";

/**
 * Throwing over the Christmas break: enough of it to pitch when games resume.
 *
 * The break block keeps plenty of catch play, but as written it left the
 * mound for three weeks and put the first real bullpens in the last week,
 * a few days before the first game back. A pitcher cannot carry a normal
 * outing off one week of bullpens; the pitch count has to be built.
 *
 * So the mound stays in every week of the break, and the pitch count climbs:
 * a light touch in the unload week, then 25–30, then 35–40, then a simulated
 * game of three short innings — about 45 pitches with sit-downs — the week
 * before games resume. The catch volume in the unload week comes down, but not
 * so far that the arm loses its base.
 */

interface Mound {
  name: string;
  prescription: string;
  cue: string;
  setup: string;
  execution: string;
  rest: string;
  stop: string;
}

const BULLPEN_DETAIL = {
  setup: "Full mound, a catcher, and a pitch count. Log the count in the session report.",
  stop: "Stop for arm pain, a drop in command you cannot get back, or any medial elbow symptoms.",
};

/** The mound work for each week of the break, by the day it falls on. */
const MOUND: readonly Partial<Record<number, Mound>>[] = [
  // Week 1: unload, but the mound is not left.
  {
    2: {
      name: "Mound touch",
      prescription: "15–20 pitches · 60–70% · fastballs only",
      cue: "Just enough to keep the feel of the slope during the unload week. Easy intent, no secondaries, no radar.",
      ...BULLPEN_DETAIL,
      execution: "Fastballs to both sides from the stretch and the windup. Stop at 20.",
      rest: "Unhurried; step off whenever you like.",
    },
  },
  // Week 2: rebuild.
  {
    2: {
      name: "Bullpen",
      prescription: "25–30 pitches · 70–80% · fastball command, then changeup",
      cue: "The first full bullpen of the break. Command first; the count builds from here every week until games are back.",
      ...BULLPEN_DETAIL,
      execution: "Two-thirds fastballs to both sides, then changeups in game counts.",
      rest: "A short break every 10–12 pitches.",
    },
  },
  // Week 3: force — the pulldowns stay on Wednesday, the bullpen goes on Saturday.
  {
    5: {
      name: "Bullpen",
      prescription: "35–40 pitches · 80–85% · every pitch type",
      cue: "The count climbs again so the first outing back is not the arm's first real workload in a month. All pitches, in game counts.",
      ...BULLPEN_DETAIL,
      execution: "Fastballs to both sides, then each secondary, finishing with a short game sequence.",
      rest: "Work in sets of 12–15 with a minute between them.",
    },
  },
  // Week 4: re-entry — a simulated game, then a short pen to stay sharp.
  {
    2: {
      name: "Simulated game",
      prescription: "3 innings × 15 pitches · 85–90% · 6–8 minutes seated between innings",
      cue: "About 45 pitches the way a game asks for them: get hot, sit down, get up again. This is what lets the first game back carry a normal outing.",
      ...BULLPEN_DETAIL,
      execution: "Each inning to imaginary hitters in game counts, all pitch types. Sit down between innings as you would in a game.",
      rest: "6–8 minutes seated between innings, with a few warm-up throws before each.",
    },
    5: {
      name: "Short bullpen",
      prescription: "20–25 pitches · 75–85% · stay sharp for the first game back",
      cue: "Keep the feel without adding fatigue. Games resume this week.",
      ...BULLPEN_DETAIL,
      execution: "Fastball command, one or two of each secondary, finish on a good fastball.",
      rest: "Game tempo.",
    },
  },
];

/** The unload week's catch volumes: down, not gone. */
const UNLOAD_CATCH: Readonly<Record<string, string>> = {
  "Recovery catch": "35–45 total throws · 60–75 ft · 50–60% effort",
  "Flat-ground command": "35–45 total throws · 90–120 ft · 65–75% effort",
  "Distance catch build": "30–40 throws · build to 120–150 ft · 60–70% · no pulldowns",
};

/** The mound task the break puts on this day, or null. Replaces the day's high-intent or development throwing. */
const REPLACED = /pulldown|distance catch build|controlled mound build/i;

export function withChristmasThrowing(session: Session, week: WeekPlan, day: number): Session {
  if (week.phase.id !== "summer_break") return session;
  // `weeks` is the phase's first and last week.
  const index = week.week - week.phase.weeks[0];
  if (index < 0) return session;
  const mound = MOUND[Math.min(index, MOUND.length - 1)]?.[day];
  let placed = false;
  const tasks = session.tasks.map((task): SessionTask => {
    if (task.stageTitle !== "Throw") return task;
    if (mound && !placed && REPLACED.test(String(task.name))) {
      placed = true;
      return { ...task, stageDescription: "Mound work through the break, building to a game's pitch count.", ...mound };
    }
    if (index === 0 && UNLOAD_CATCH[String(task.name)]) {
      return { ...task, prescription: UNLOAD_CATCH[String(task.name)] };
    }
    return task;
  });
  return placed || index === 0 ? { ...session, tasks } : session;
}
