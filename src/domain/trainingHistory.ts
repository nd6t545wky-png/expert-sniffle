/**
 * Immutable training history: what happened, when, and in what order.
 *
 * The snapshot in `sync_snapshots` is the *current* state — a corrected
 * check-in replaces the old one, a reopened task disappears from the list.
 * This is the record underneath it: every submission, correction and tick is
 * appended as its own event and never rewritten, so "what did the app say on
 * that day, and what changed afterwards" always has an answer.
 *
 * The event shape is the one the prototype (`public/training-history.js`)
 * already writes, so events from either app read back in the other, and the
 * history a device built under the prototype carries straight across.
 *
 * Nothing here touches the network or storage. Events are *derived* from the
 * difference between two states, which is what lets this sit underneath every
 * screen without each one having to remember to log.
 */

import { AppState, IsoDate } from "./state";

export const HISTORY_COLLECTIONS = [
  "planSnapshots",
  "checkIns",
  "taskChanges",
  "checkOuts",
  "performanceResults",
  "planChanges",
] as const;

export type HistoryCollection = (typeof HISTORY_COLLECTIONS)[number];

/** Collection → the `event_type` the Worker and the D1 CHECK constraint accept. */
export const HISTORY_EVENT_TYPE: Record<HistoryCollection, string> = {
  planSnapshots: "plan_snapshot",
  checkIns: "health_check_in",
  taskChanges: "task_completion",
  checkOuts: "session_check_out",
  performanceResults: "performance_result",
  planChanges: "plan_change",
};

export interface TrainingHistoryEvent {
  readonly id: string;
  readonly collection: HistoryCollection;
  readonly date: IsoDate;
  readonly type: string;
  readonly occurredAt: string;
  readonly revision: number;
  readonly supersedesId: string;
  readonly payload: Readonly<Record<string, unknown>>;
  /** Empty until the server has accepted it. */
  readonly uploadedAt: string;
}

export interface TrainingHistory {
  readonly schemaVersion: 1;
  readonly events: readonly TrainingHistoryEvent[];
}

const ID_PATTERN = /^[a-z][a-z0-9_-]{11,79}$/i;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCollection(value: unknown): value is HistoryCollection {
  return typeof value === "string" && (HISTORY_COLLECTIONS as readonly string[]).includes(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createHistoryId(random: Pick<Crypto, "getRandomValues"> = crypto): string {
  const bytes = random.getRandomValues(new Uint8Array(12));
  return `history_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function sanitizeEvent(value: unknown): TrainingHistoryEvent | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || !ID_PATTERN.test(value.id)) return null;
  if (!isCollection(value.collection)) return null;
  if (typeof value.date !== "string" || !DAY_PATTERN.test(value.date)) return null;
  if (typeof value.type !== "string" || value.type.length < 2 || value.type.length > 80) return null;
  if (typeof value.occurredAt !== "string" || !Number.isFinite(Date.parse(value.occurredAt))) return null;
  if (!isRecord(value.payload)) return null;
  return Object.freeze({
    id: value.id,
    collection: value.collection,
    date: value.date,
    type: value.type,
    occurredAt: value.occurredAt,
    revision: Math.max(1, Math.floor(Number(value.revision) || 1)),
    supersedesId: typeof value.supersedesId === "string" ? value.supersedesId : "",
    payload: Object.freeze(clone(value.payload)),
    uploadedAt: typeof value.uploadedAt === "string" ? value.uploadedAt : "",
  });
}

export function emptyTrainingHistory(): TrainingHistory {
  return Object.freeze({ schemaVersion: 1, events: Object.freeze([]) });
}

/**
 * Read whatever is stored into a clean, ordered, de-duplicated history.
 * Unreadable events are dropped rather than failing the whole read; an event
 * seen twice keeps the copy that records an upload.
 */
export function hydrateTrainingHistory(value: unknown): TrainingHistory {
  if (!isRecord(value) || !Array.isArray(value.events)) return emptyTrainingHistory();
  const byId = new Map<string, TrainingHistoryEvent>();
  for (const candidate of value.events) {
    const event = sanitizeEvent(candidate);
    if (!event) continue;
    const existing = byId.get(event.id);
    if (!existing || (!existing.uploadedAt && event.uploadedAt)) byId.set(event.id, event);
  }
  return Object.freeze({
    schemaVersion: 1,
    events: Object.freeze(
      [...byId.values()].sort(
        (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.id.localeCompare(b.id)
      )
    ),
  });
}

export function latestEvent(
  history: TrainingHistory,
  collection: HistoryCollection,
  date: IsoDate,
  match: (event: TrainingHistoryEvent) => boolean = () => true
): TrainingHistoryEvent | null {
  for (let i = history.events.length - 1; i >= 0; i -= 1) {
    const event = history.events[i];
    if (event.collection === collection && event.date === date && match(event)) return event;
  }
  return null;
}

export interface AppendInput {
  collection: HistoryCollection;
  date: IsoDate;
  type: string;
  payload: Record<string, unknown>;
  occurredAt: string;
  /** Narrows which earlier event this one supersedes (e.g. the same task). */
  supersedes?: (event: TrainingHistoryEvent) => boolean;
}

export function appendHistoryEvents(
  historyValue: unknown,
  inputs: AppendInput[],
  newId: () => string = () => createHistoryId()
): TrainingHistory {
  const history = hydrateTrainingHistory(historyValue);
  if (!inputs.length) return history;
  let working = history;
  for (const input of inputs) {
    if (!DAY_PATTERN.test(input.date)) continue;
    const prior = latestEvent(working, input.collection, input.date, input.supersedes);
    const event = sanitizeEvent({
      id: newId(),
      collection: input.collection,
      date: input.date,
      type: input.type,
      occurredAt: input.occurredAt,
      revision: (prior?.revision ?? 0) + 1,
      supersedesId: prior?.id ?? "",
      payload: input.payload,
      uploadedAt: "",
    });
    if (!event) continue;
    working = Object.freeze({ schemaVersion: 1, events: Object.freeze([...working.events, event]) });
  }
  return hydrateTrainingHistory(working);
}

export function pendingHistoryEvents(historyValue: unknown): TrainingHistoryEvent[] {
  return hydrateTrainingHistory(historyValue).events.filter((event) => !event.uploadedAt);
}

export function markHistoryEventsUploaded(historyValue: unknown, ids: string[], uploadedAt: string): TrainingHistory {
  const idSet = new Set(ids);
  const history = hydrateTrainingHistory(historyValue);
  return hydrateTrainingHistory({
    schemaVersion: 1,
    events: history.events.map((event) => (idSet.has(event.id) ? { ...event, uploadedAt } : event)),
  });
}

/** Union of two copies of the history. An event in both keeps its upload mark. */
export function mergeTrainingHistories(a: unknown, b: unknown): TrainingHistory {
  return hydrateTrainingHistory({
    schemaVersion: 1,
    events: [...hydrateTrainingHistory(a).events, ...hydrateTrainingHistory(b).events],
  });
}

/** Add events read back from the server; they are, by definition, uploaded. */
export function importRemoteHistoryEvents(historyValue: unknown, events: unknown[], uploadedAt: string): TrainingHistory {
  const local = hydrateTrainingHistory(historyValue);
  const incoming = events.map((event) => (isRecord(event) ? { ...event, uploadedAt } : event));
  return hydrateTrainingHistory({ schemaVersion: 1, events: [...local.events, ...incoming] });
}

// --- Deriving events from a state change --------------------------------------

type DateMap = Record<string, unknown>;

function asMap(value: unknown): DateMap {
  return isRecord(value) ? value : {};
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function datesIn(...maps: DateMap[]): IsoDate[] {
  const dates = new Set<string>();
  for (const map of maps) for (const key of Object.keys(map)) if (DAY_PATTERN.test(key)) dates.add(key);
  return [...dates].sort();
}

/**
 * A whole-record field — check-in, check-out, throwing entry — on one date.
 * First write is "submitted", a later change "corrected", removal "removed",
 * and the full record goes in the payload each time so nothing has to be
 * reconstructed from deltas.
 */
function recordChanges(
  collection: HistoryCollection,
  prefix: string,
  before: DateMap,
  after: DateMap,
  occurredAt: string
): AppendInput[] {
  const inputs: AppendInput[] = [];
  for (const date of datesIn(before, after)) {
    const was = before[date];
    const now = after[date];
    if (same(was, now)) continue;
    const type = now === undefined ? `${prefix}_removed` : was === undefined ? `${prefix}_submitted` : `${prefix}_corrected`;
    inputs.push({ collection, date, type, occurredAt, payload: { date, record: now === undefined ? null : clone(now) } });
  }
  return inputs;
}

function taskIds(value: unknown): Set<string> {
  return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []);
}

/** Individual task ticks, so a reopened task is visible as its own step. */
function taskChanges(before: AppState, after: AppState, occurredAt: string): AppendInput[] {
  const inputs: AppendInput[] = [];
  const doneBefore = asMap(before.completedTasks);
  const doneAfter = asMap(after.completedTasks);
  const skipBefore = asMap(before.skippedTasks);
  const skipAfter = asMap(after.skippedTasks);

  for (const date of datesIn(doneBefore, doneAfter, skipBefore, skipAfter)) {
    const was = taskIds(doneBefore[date]);
    const now = taskIds(doneAfter[date]);
    const forTask = (taskId: string) => (event: TrainingHistoryEvent) => event.payload.taskId === taskId;
    for (const taskId of now) {
      if (!was.has(taskId)) {
        inputs.push({ collection: "taskChanges", date, type: "task_completed", occurredAt, payload: { date, taskId }, supersedes: forTask(taskId) });
      }
    }
    for (const taskId of was) {
      if (!now.has(taskId)) {
        inputs.push({ collection: "taskChanges", date, type: "task_reopened", occurredAt, payload: { date, taskId }, supersedes: forTask(taskId) });
      }
    }

    const skippedWas = asMap(skipBefore[date]);
    const skippedNow = asMap(skipAfter[date]);
    for (const taskId of new Set([...Object.keys(skippedWas), ...Object.keys(skippedNow)])) {
      if (same(skippedWas[taskId], skippedNow[taskId])) continue;
      const removed = skippedNow[taskId] === undefined;
      inputs.push({
        collection: "taskChanges",
        date,
        type: removed ? "task_skip_reopened" : "task_skipped",
        occurredAt,
        payload: { date, taskId, skip: removed ? null : clone(skippedNow[taskId]) },
        supersedes: forTask(taskId),
      });
    }
  }
  return inputs;
}

/**
 * Append an event for everything that changed between two states.
 *
 * Call this for changes made *on this device* only. A sync merge brings in
 * another device's edits, and that device has already logged them — logging
 * them again here would double every one.
 */
export function recordStateChanges(
  before: AppState,
  after: AppState,
  occurredAt: string = new Date().toISOString(),
  newId?: () => string
): AppState {
  if (before === after) return after;
  const inputs = [
    ...recordChanges("checkIns", "health_check_in", asMap(before.pre), asMap(after.pre), occurredAt),
    ...taskChanges(before, after, occurredAt),
    ...recordChanges("checkOuts", "session_check_out", asMap(before.post), asMap(after.post), occurredAt),
    ...recordChanges("performanceResults", "throwing_result", asMap(before.bullpens), asMap(after.bullpens), occurredAt),
  ];
  if (!inputs.length) return after;
  // Start from whichever side holds history: a mutation that rebuilt the
  // state without carrying `trainingHistory` must not wipe it.
  const base = after.trainingHistory ?? before.trainingHistory;
  return { ...after, trainingHistory: appendHistoryEvents(base, inputs, newId) };
}
