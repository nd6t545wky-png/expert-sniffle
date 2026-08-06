/**
 * Application state schema.
 *
 * Typing policy — deliberate and important:
 *
 * Fields are typed precisely ONLY where the shape has been verified against
 * the live app (public/app.js). Everything else is modelled as a preserved
 * opaque value. That is not laziness: inventing a narrow type for data whose
 * real shape hasn't been confirmed is how a migration silently drops fields.
 * Unknown data is carried through untouched until someone verifies it and
 * tightens the type here.
 */

/** Calendar date, `YYYY-MM-DD`. Session records are keyed by this. */
export type IsoDate = string;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Schema version written to storage.
 *
 * DO NOT BUMP THIS while the legacy app (public/app.js) is still deployed.
 * That app gates on `stored.version === 1` and falls back to a fresh default
 * state for anything else — so writing version 2 would not "migrate" the
 * user, it would silently erase every saved session the next time the live
 * app loaded. The version may only move once the legacy app is retired.
 *
 * Migration infrastructure below is version-aware and ready for that day.
 */
export const SCHEMA_VERSION = 1;

/** Storage keys, current and legacy. Order matters: current first. */
export const STORAGE_KEY = "dylan-pitching-os-v1";
export const LEGACY_STORAGE_KEYS: readonly string[] = Object.freeze([
  // Referenced by the Phase 1 brief. No occurrences exist in the live app —
  // kept so that if such data does exist on a device, it is adopted rather
  // than ignored.
  "dylanCleanV1",
]);

/** Keys that are UI position, not user data — safe to reset on load. */
export const EPHEMERAL_KEYS: readonly string[] = Object.freeze([
  "page",
  "selectedWeek",
  "selectedDay",
  "lastOpenDate",
]);

/**
 * A record map keyed by ISO date (readiness, session reports, task
 * completion, ...). Values are preserved as-is pending verification.
 */
export type DateKeyedMap = Record<IsoDate, unknown>;

export interface AppState {
  version: number;
  onboardingComplete?: boolean;
  syncUpdatedAt?: string;

  /** Pre-session readiness submissions, keyed by ISO date. */
  pre: DateKeyedMap;
  /** Post-session reports, keyed by ISO date. */
  post: DateKeyedMap;
  completedTasks: DateKeyedMap;
  skippedTasks: DateKeyedMap;
  taskCompletionUpdatedAt: DateKeyedMap;
  healthPrefill: DateKeyedMap;
  pulseImports: DateKeyedMap;
  /** Throwing workload, keyed by ISO date. */
  bullpens: DateKeyedMap;
  weeklyReviews: DateKeyedMap;

  healthHistoryFetchedAt?: string;
  trainingHistory?: unknown;
  mechanics?: unknown;
  nutrition?: unknown;
  pbs?: unknown;
  profile?: unknown;

  /** Any field this schema does not know about, carried through verbatim. */
  [key: string]: unknown;
}

/** The date-keyed maps, named once so parsing and migration agree. */
export const DATE_KEYED_FIELDS = Object.freeze([
  "pre",
  "post",
  "completedTasks",
  "skippedTasks",
  "taskCompletionUpdatedAt",
  "healthPrefill",
  "pulseImports",
  "bullpens",
  "weeklyReviews",
] as const);

export type DateKeyedField = (typeof DATE_KEYED_FIELDS)[number];

export interface ParseIssue {
  /** Dotted path to the offending value, e.g. `pre.2026-13-45`. */
  path: string;
  message: string;
}

export interface ParseResult {
  state: AppState | null;
  issues: ParseIssue[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function emptyDateMaps(): Pick<AppState, DateKeyedField> {
  return {
    pre: {},
    post: {},
    completedTasks: {},
    skippedTasks: {},
    taskCompletionUpdatedAt: {},
    healthPrefill: {},
    pulseImports: {},
    bullpens: {},
    weeklyReviews: {},
  };
}

/**
 * Parse an untrusted object into an AppState.
 *
 * Non-destructive by design:
 *  - unknown top-level fields are preserved
 *  - a malformed date-keyed map is reported and replaced with an empty map,
 *    but the original value is retained under `__unparsed__.<field>` so the
 *    data still exists and can be recovered
 *  - entries with invalid date keys are reported and kept, not dropped
 *
 * Returns `state: null` only when the input is not an object at all.
 */
export function parseAppState(input: unknown): ParseResult {
  const issues: ParseIssue[] = [];

  if (!isPlainObject(input)) {
    return { state: null, issues: [{ path: "", message: "State must be a JSON object." }] };
  }

  const version = typeof input.version === "number" ? input.version : SCHEMA_VERSION;
  if (typeof input.version !== "number") {
    issues.push({ path: "version", message: "Missing or non-numeric version; assuming current." });
  }

  const state: AppState = { ...input, ...emptyDateMaps(), version };
  const unparsed: Record<string, unknown> = {};

  for (const field of DATE_KEYED_FIELDS) {
    const value = input[field];
    if (value === undefined) continue;

    if (!isPlainObject(value)) {
      issues.push({ path: field, message: `Expected an object keyed by date; preserved under __unparsed__.${field}.` });
      unparsed[field] = value;
      continue;
    }

    // Keep every entry. Invalid keys are surfaced, never silently discarded.
    for (const key of Object.keys(value)) {
      if (!isIsoDate(key)) {
        issues.push({ path: `${field}.${key}`, message: "Key is not a valid YYYY-MM-DD date; entry kept as-is." });
      }
    }
    state[field] = { ...value };
  }

  if (Object.keys(unparsed).length) {
    const existing = isPlainObject(input.__unparsed__) ? input.__unparsed__ : {};
    state.__unparsed__ = { ...existing, ...unparsed };
  }

  return { state, issues };
}

/** Total number of dated records across every session map. */
export function countRecords(state: AppState): number {
  return DATE_KEYED_FIELDS.reduce((total, field) => {
    const map = state[field];
    return total + (isPlainObject(map) ? Object.keys(map).length : 0);
  }, 0);
}

/** Strip UI-position fields so they don't travel through export/import. */
export function withoutEphemeral(state: AppState): AppState {
  const copy: AppState = { ...state };
  for (const key of EPHEMERAL_KEYS) delete copy[key];
  return copy;
}
