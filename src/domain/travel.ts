import type { Session, SessionTask, WeekPlan } from "./programmeSessions";
import type { IsoDate } from "./state";

/**
 * Training on a trip: no gym, no mound, sometimes no time.
 *
 * A trip day replaces the programme's day outright. What it asks for depends
 * on what the day already holds:
 *
 *  - `full`:  a free morning or afternoon. A room strength circuit, band arm
 *             care and a catch - the trip's real training days.
 *  - `light`: a full day out. Fifteen minutes before breakfast.
 *  - `move`:  a travel day, or a day that is already hard on the legs (a
 *             trek, 600 steps up a mountain, a day of temples). Mobility only;
 *             the day is the conditioning.
 *
 * Everything is bodyweight plus one resistance band, so it works in a hotel
 * room. A hotel gym, where there is one, is a bonus and each session says how
 * to use it.
 */
export type TripLoad = "full" | "light" | "move";

export interface TripDay {
  date: IsoDate;
  /** The trip's name: "Vietnam & Cambodia". */
  title: string;
  /** What the day holds: "Fansipan: cable car and 600 steps". */
  label: string;
  load: TripLoad;
}

export function readTripDays(value: unknown): TripDay[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const raw = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const load = raw.load === "full" || raw.load === "light" || raw.load === "move" ? raw.load : null;
    return typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) && load
      ? [{ date: raw.date as IsoDate, title: String(raw.title ?? "Trip").slice(0, 80), label: String(raw.label ?? "").slice(0, 120), load }]
      : [];
  });
}

/** Trip days out of the events the owner sent: a sent game marked with a `trip` load. */
export function tripDaysFromEvents(events: unknown): TripDay[] {
  if (!Array.isArray(events)) return [];
  return readTripDays(
    events.flatMap((event) => {
      const raw = (event && typeof event === "object" ? event : {}) as { title?: unknown; games?: unknown };
      return (Array.isArray(raw.games) ? raw.games : []).map((game) => {
        const g = (game && typeof game === "object" ? game : {}) as Record<string, unknown>;
        return { date: g.date, title: raw.title, label: g.label, load: g.trip };
      });
    })
  ).sort((a, b) => a.date.localeCompare(b.date));
}

const PREPARE = "Loosen up after the bus, the plane or the bed.";
const STRENGTH = "Bodyweight and one band. Slow lowering makes light loads count.";
const ARM = "Keep the cuff and scapula working while the arm is off the mound.";
const THROW = "Keep the arm moving. Easy, short, and only if you packed a ball.";

function mobility(p: string, minutes: number): SessionTask {
  return {
    id: `${p}-mobility`,
    stage: 1,
    stageTitle: "Prepare",
    stageDescription: PREPARE,
    name: "Travel mobility flow",
    prescription: `${minutes} minutes · World's Greatest Stretch 4/side · 90/90 hip switch 6/side · open book 5/side · deep squat hold 2 × 30 s · calf stretch 30 s/side`,
    cue: "Move, do not force. Hips and upper back are what a bus seat and a plane seat take away.",
    setup: "Floor space the length of your body. A towel on a hard floor.",
    execution: "Straight through, breathing out into each end position. Repeat the flow until the time is up.",
    rest: "None.",
    stop: "Stop for pinching in the hip or shoulder; back off the range, not the session.",
  };
}

function armCare(p: string, sets: number): SessionTask {
  return {
    id: `${p}-arm-care`,
    stage: 3,
    stageTitle: "Arm Care",
    stageDescription: ARM,
    name: "Band arm care",
    prescription: `${sets} × 12 each · external rotation at the side · pull-apart · Y raise · serratus wall slide (no band)`,
    cue: "Light band, clean reps. This is what keeps two weeks off from costing you the shoulder.",
    setup: "One light resistance band, anchored in a door at elbow height. No band: do the wall slides and prone Y and T raises on the bed.",
    execution: "Slow out, slower back. Shoulder blades set before each rep; no shrugging.",
    rest: "30 seconds between movements.",
    stop: "Stop for pain in the front of the shoulder or the inner elbow.",
  };
}

function strength(p: string): SessionTask[] {
  const task = (id: string, name: string, prescription: string, cue: string, setup: string): SessionTask => ({
    id: `${p}-${id}`,
    stage: 2,
    stageTitle: "Room Strength",
    stageDescription: STRENGTH,
    name,
    prescription,
    cue,
    setup,
    execution: "Three seconds down, one-second pause, up with intent.",
    rest: "60 seconds.",
    stop: "Stop the set when the tempo goes or a joint hurts.",
  });
  return [
    task(
      "split-squat",
      "Rear-foot-elevated split squat",
      "3 × 8/leg · 3 s lowering · bodyweight",
      "Back foot on the bed or a chair. Too easy: hold your packed bag, or add a 2 s pause at the bottom.",
      "Bed or chair behind you. Hotel gym: hold dumbbells, 3 × 6/leg at RPE 7."
    ),
    task(
      "hinge",
      "Single-leg Romanian deadlift",
      "3 × 8/leg · 3 s lowering · reach to the floor",
      "Hips back, long spine. Hold your bag in the opposite hand to load it.",
      "Clear floor, a wall within reach for balance. Hotel gym: one dumbbell, RPE 7."
    ),
    task(
      "push-up",
      "Push-up",
      "3 × 8-15 · 3 s lowering · stop 2 short of failure",
      "Body in one line. Too easy: feet on the bed. Too hard: hands on the bed.",
      "Floor. Hotel gym: dumbbell press 3 × 8 at RPE 7 if you prefer."
    ),
    task(
      "row",
      "Band row",
      "3 × 12 · 1 s squeeze",
      "Pull to the lower ribs, shoulder blade back, no shrug.",
      "Band anchored in a door. No band: towel row, leaning back from a closed door's handle."
    ),
    task(
      "trunk",
      "Side plank + dead bug",
      "2 rounds · side plank 30 s/side · dead bug 8/side",
      "Ribs down, slow limbs. Quality over time.",
      "Towel on the floor."
    ),
  ];
}

function catchPlay(p: string): SessionTask {
  return {
    id: `${p}-catch`,
    stage: 4,
    stageTitle: "Throw",
    stageDescription: THROW,
    name: "Easy catch",
    prescription: "30-40 throws · build to 60-90 ft · 50-60% effort",
    cue: "Loose arc, clean direction. This is to keep the arm moving, not to train it.",
    setup: "A glove each, a ball and a partner, on a beach, a park or a quiet street. No ball or no room: 2 × 15 towel drills at the same easy effort.",
    execution: "Start close, add distance while it feels free, come back in. Count the throws.",
    rest: "Natural rhythm.",
    stop: "Stop if the arm does not loosen, or anything is sharp.",
  };
}

/** The day's session on a trip. */
export function travelSession(week: WeekPlan, day: number, trip: TripDay, recoveryOnly = false): Session {
  const p = `w${week.week}-d${day}-trip`;
  const load: TripLoad = recoveryOnly ? "move" : trip.load;
  const where = trip.label ? `${trip.title}: ${trip.label}.` : `${trip.title}.`;
  if (load === "move") {
    return {
      title: "Travel Day · Mobility",
      focus: "Undo the sitting; the day is the conditioning",
      duration: "10 min",
      stress: "Low",
      description: `${where} No training today beyond ten minutes of mobility. Walk when you can and keep drinking water.`,
      tasks: [mobility(p, 10)],
    };
  }
  if (load === "light") {
    return {
      title: "Trip Day · 15-Minute Session",
      focus: "Mobility and arm care before breakfast",
      duration: "15 min",
      stress: "Low",
      description: `${where} A full day out, so a short one before breakfast: mobility, then band arm care.`,
      tasks: [mobility(p, 6), armCare(p, 2)],
    };
  }
  return {
    title: "Trip Day · Room Strength + Catch",
    focus: "The trip's training day: strength, arm care and a catch",
    duration: "35-40 min",
    stress: "Moderate",
    description: `${where} Free time today, so this is a real session. No equipment needed beyond one band; if the hotel has a gym, each lift says what to do there.`,
    tasks: [mobility(p, 6), ...strength(p), armCare(p, 3), catchPlay(p)],
  };
}
