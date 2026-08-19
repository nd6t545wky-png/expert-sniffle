/**
 * A read-only link an athlete can send to their physio.
 *
 * The workspace is end-to-end encrypted: the server stores ciphertext and a
 * hash of the sync key, and cannot read a single field of it. That is a
 * property worth keeping, so this does not ask the server to decrypt anything
 * — and it does not hand the physio the sync key either, because the sync key
 * is also the write credential. Anyone holding it can overwrite or delete the
 * whole workspace.
 *
 * So a share is built the other way round:
 *
 *   1. The athlete's own browser, which already has the plaintext, builds a
 *      summary of the things a physio needs.
 *   2. It encrypts that summary under a **fresh random key**, used for
 *      nothing else.
 *   3. The ciphertext goes to the server under a random share id. The server
 *      still cannot read it.
 *   4. The link carries the id in the path and the key in the URL *fragment*.
 *      Browsers never send a fragment to a server, so the key never leaves the
 *      two people who are meant to have it.
 *
 * The physio therefore gets exactly one capability: read this summary. There
 * is no share endpoint that writes to the workspace, so read-only is a fact of
 * the design rather than a promise. Revoking is deleting one row.
 *
 * What it deliberately leaves out: anything the physio has no business seeing
 * to do their job. This is a clinical summary, not a copy of the workspace.
 */

import { IsoDate } from "./state";
import { ArmExam, armScore, erIrRatio, limbSymmetry } from "./armCare";
import { addDays } from "./calendar";

export interface PhysioDay {
  date: IsoDate;
  /** Readiness score and the plan level it produced, when checked in. */
  readiness?: { score: number | null; planLevel: string | null };
  /** Soreness as reported, which is what a physio actually reads. */
  soreness?: { shoulder?: number; elbow?: number; forearm?: number };
  /** Throwing done that day. */
  throwing?: { throws: number | null; intent: string | null; gamePitches?: number | null };
  /** Session work resolved, as a fraction. */
  session?: { completed: number; skipped: number; total: number };
  /** Where the day sat in a recovery protocol, if anywhere. */
  recovery?: string;
}

export interface PhysioArmScreen {
  date: IsoDate;
  /** Strength as a percentage of bodyweight, throwing arm. */
  armScorePercent: number | null;
  erIrRatio: number | null;
  limbSymmetryPercent: number | null;
}

export interface PhysioSummary {
  version: 1;
  athlete: string;
  throwingHand: string;
  generatedAt: string;
  /** Most recent first. */
  days: PhysioDay[];
  armScreens: PhysioArmScreen[];
  /** Acute:chronic and its band, so the physio sees the same number as you. */
  workload?: { ratio: number | null; inBand: boolean | null };
  /** Anything the log says about rest already taken. */
  restProblems: string[];
}

/** How many days of history a share carries. Enough for context, not a life story. */
export const SHARE_DAYS = 28;

/**
 * A share key is its own secret, unrelated to the sync key.
 *
 * 32 bytes of randomness, hex encoded — the same shape the envelope helpers
 * already take, so no new crypto is introduced for this.
 */
export function newShareKey(random: Crypto = crypto): string {
  const bytes = random.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A share id is public — it names the row, and grants only reading it. */
export function newShareId(random: Crypto = crypto): string {
  const bytes = random.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const SHARE_ID_PATTERN = /^[a-f0-9]{32}$/;
export const SHARE_KEY_PATTERN = /^[a-f0-9]{64}$/;

/**
 * The link the athlete sends.
 *
 * The key sits after the `#`. That is not decoration: a fragment is never put
 * on the wire, so the server hosting the ciphertext never learns the key that
 * opens it.
 */
export function shareLink(origin: string, shareId: string, shareKey: string): string {
  return `${origin}/next/?share=${shareId}#${shareKey}`;
}

/** Pull the id and key back out of a link the physio opened. */
export function readShareLink(search: string, hash: string): { id: string; key: string } | null {
  const id = new URLSearchParams(search).get("share") ?? "";
  const key = hash.replace(/^#/, "");
  if (!SHARE_ID_PATTERN.test(id) || !SHARE_KEY_PATTERN.test(key)) return null;
  return { id, key };
}

// --- Building the summary ---------------------------------------------------

/**
 * What the builder is given.
 *
 * Plain maps out of the workspace, plus two callbacks for the things that are
 * derived rather than stored — how many tasks a day's plan held, and where the
 * day sat in a recovery protocol. Passing those in keeps this module free of
 * the programme and the protocol, so a change to either cannot quietly change
 * what a physio is shown.
 */
export interface PhysioSummaryInput {
  /** The most recent day to include. Everything is counted back from here. */
  today: IsoDate;
  athlete?: string;
  throwingHand?: string;
  generatedAt?: string;
  /** Readiness check-ins, keyed by date. */
  pre?: Record<string, unknown>;
  /** Throwing entries, keyed by date. */
  bullpens?: Record<string, unknown>;
  /** Competition outings. */
  games?: Array<{ date?: unknown; pitches?: unknown }>;
  completedTasks?: Record<string, unknown>;
  skippedTasks?: Record<string, unknown>;
  /** How many tasks the plan held that day, so a fraction means something. */
  plannedTaskCount?: (date: IsoDate) => number;
  /** A one-line description of the day's place in a recovery protocol. */
  recoveryLabel?: (date: IsoDate) => string | null;
  exams?: ArmExam[];
  workload?: { ratio: number | null; inBand: boolean | null };
  restProblems?: string[];
  /** Override the window, for tests. */
  days?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function score0to10(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10) return undefined;
  return parsed;
}

function count(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (isRecord(value)) return Object.keys(value).length;
  return 0;
}

/** Soreness as the athlete reported it, which is the part a physio reads first. */
function sorenessFrom(entry: Record<string, unknown>): PhysioDay["soreness"] {
  const inputs = isRecord(entry.inputs) ? entry.inputs : entry;
  const soreness = {
    shoulder: score0to10(inputs.shoulder),
    elbow: score0to10(inputs.elbow),
    forearm: score0to10(inputs.forearm),
  };
  return Object.values(soreness).some((value) => value !== undefined) ? soreness : undefined;
}

function throwingFrom(entry: unknown): PhysioDay["throwing"] {
  if (!isRecord(entry)) return undefined;
  const throws = Number(entry.throws);
  const intent = typeof entry.intent === "string" ? entry.intent : null;
  if (!Number.isFinite(throws) && !intent) return undefined;
  return { throws: Number.isFinite(throws) ? throws : null, intent };
}

/**
 * Build the summary the physio sees.
 *
 * Days with nothing recorded are left out rather than shipped empty — a run of
 * blank rows reads as an athlete who stopped training, when it usually means a
 * rest week. Anything absent stays absent; nothing here invents a value.
 */
export function buildPhysioSummary(input: PhysioSummaryInput): PhysioSummary {
  const window = Math.max(1, input.days ?? SHARE_DAYS);
  const pre = input.pre ?? {};
  const bullpens = input.bullpens ?? {};
  const completed = input.completedTasks ?? {};
  const skipped = input.skippedTasks ?? {};

  const gamePitchesOn = new Map<string, number | null>();
  for (const game of input.games ?? []) {
    const date = typeof game?.date === "string" ? game.date : null;
    if (!date) continue;
    const pitches = Number(game?.pitches);
    gamePitchesOn.set(date, Number.isFinite(pitches) ? pitches : null);
  }

  const days: PhysioDay[] = [];
  for (let back = 0; back < window; back += 1) {
    const date = addDays(input.today, -back);
    const day: PhysioDay = { date };
    let anything = false;

    const checkIn = pre[date];
    if (isRecord(checkIn)) {
      const score = Number(checkIn.score);
      day.readiness = {
        score: Number.isFinite(score) ? score : null,
        planLevel: typeof checkIn.planLevel === "string" ? checkIn.planLevel : null,
      };
      const soreness = sorenessFrom(checkIn);
      if (soreness) day.soreness = soreness;
      anything = true;
    }

    const throwing = throwingFrom(bullpens[date]);
    const gamePitches = gamePitchesOn.get(date);
    if (throwing || gamePitches !== undefined) {
      day.throwing = {
        throws: throwing?.throws ?? null,
        intent: throwing?.intent ?? null,
        ...(gamePitches !== undefined ? { gamePitches } : {}),
      };
      anything = true;
    }

    const done = count(completed[date]);
    const passed = count(skipped[date]);
    if (done || passed) {
      const planned = input.plannedTaskCount?.(date) ?? 0;
      day.session = { completed: done, skipped: passed, total: Math.max(planned, done + passed) };
      anything = true;
    }

    const recovery = input.recoveryLabel?.(date) ?? null;
    if (recovery) {
      day.recovery = recovery;
      anything = true;
    }

    if (anything) days.push(day);
  }

  const armScreens: PhysioArmScreen[] = (input.exams ?? [])
    .filter((exam) => exam?.date >= addDays(input.today, -(window * 3)))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 6)
    .map((exam) => ({
      date: exam.date,
      armScorePercent: armScore(exam)?.score ?? null,
      erIrRatio: erIrRatio(exam.throwing)?.value ?? null,
      limbSymmetryPercent: limbSymmetry(exam)?.value ?? null,
    }));

  return {
    version: 1,
    athlete: input.athlete?.trim() || "Athlete",
    throwingHand: input.throwingHand?.trim() || "unstated",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    days,
    armScreens,
    ...(input.workload ? { workload: input.workload } : {}),
    restProblems: input.restProblems ?? [],
  };
}

/**
 * Read a decrypted payload back into a summary.
 *
 * The viewer runs on whatever the link points at, so it validates rather than
 * casts: a payload that decrypts but is not a summary must produce a message,
 * not a half-rendered page of `undefined`.
 */
export function readPhysioSummary(value: unknown): PhysioSummary | null {
  if (!isRecord(value) || value.version !== 1) return null;
  if (!Array.isArray(value.days) || !Array.isArray(value.armScreens)) return null;
  return {
    version: 1,
    athlete: typeof value.athlete === "string" ? value.athlete : "Athlete",
    throwingHand: typeof value.throwingHand === "string" ? value.throwingHand : "unstated",
    generatedAt: typeof value.generatedAt === "string" ? value.generatedAt : "",
    days: value.days.filter(isRecord) as unknown as PhysioDay[],
    armScreens: value.armScreens.filter(isRecord) as unknown as PhysioArmScreen[],
    workload: isRecord(value.workload) ? (value.workload as PhysioSummary["workload"]) : undefined,
    restProblems: Array.isArray(value.restProblems)
      ? value.restProblems.filter((item): item is string => typeof item === "string")
      : [],
  };
}
