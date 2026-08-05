"use strict";
var PitchingHistory = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/training-history.ts
  var training_history_exports = {};
  __export(training_history_exports, {
    HISTORY_COLLECTIONS: () => HISTORY_COLLECTIONS,
    appendHistoryEvent: () => appendHistoryEvent,
    emptyTrainingHistory: () => emptyTrainingHistory,
    eventsFor: () => eventsFor,
    hydrateTrainingHistory: () => hydrateTrainingHistory,
    importRemoteHistoryEvents: () => importRemoteHistoryEvents,
    latestEvent: () => latestEvent,
    latestPlanPayload: () => latestPlanPayload,
    markHistoryEventsUploaded: () => markHistoryEventsUploaded,
    mergeTrainingHistories: () => mergeTrainingHistories,
    pendingHistoryEvents: () => pendingHistoryEvents
  });
  var HISTORY_COLLECTIONS = [
    "planSnapshots",
    "checkIns",
    "taskChanges",
    "checkOuts",
    "performanceResults",
    "planChanges"
  ];
  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
  function isIsoDay(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }
  function isHistoryCollection(value) {
    return typeof value === "string" && HISTORY_COLLECTIONS.includes(value);
  }
  function clonePayload(value) {
    return JSON.parse(JSON.stringify(value));
  }
  function createId(prefix) {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    const suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${prefix}_${suffix}`;
  }
  function sanitizeEvent(value) {
    if (!isRecord(value)) return null;
    if (typeof value.id !== "string" || !/^[a-z][a-z0-9_-]{11,79}$/i.test(value.id)) return null;
    if (!isHistoryCollection(value.collection) || !isIsoDay(value.date)) return null;
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
      payload: Object.freeze(clonePayload(value.payload)),
      uploadedAt: typeof value.uploadedAt === "string" ? value.uploadedAt : ""
    });
  }
  function emptyTrainingHistory() {
    return Object.freeze({ schemaVersion: 1, events: Object.freeze([]) });
  }
  function hydrateTrainingHistory(value) {
    if (!isRecord(value) || !Array.isArray(value.events)) return emptyTrainingHistory();
    const byId = /* @__PURE__ */ new Map();
    for (const candidate of value.events) {
      const event = sanitizeEvent(candidate);
      if (!event) continue;
      const existing = byId.get(event.id);
      if (!existing || !existing.uploadedAt && event.uploadedAt) byId.set(event.id, event);
    }
    return Object.freeze({
      schemaVersion: 1,
      events: Object.freeze([...byId.values()].sort((left, right) => {
        const time = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
        return time || left.id.localeCompare(right.id);
      }))
    });
  }
  function eventsFor(history, collection, date) {
    return history.events.filter((event) => event.collection === collection && (!date || event.date === date));
  }
  function latestEvent(history, collection, date) {
    return eventsFor(history, collection, date).at(-1) || null;
  }
  function appendHistoryEvent(historyValue, collection, date, type, payload, options = {}) {
    if (!isIsoDay(date)) throw new Error("History events require a valid session date");
    if (!isHistoryCollection(collection)) throw new Error("History event collection is invalid");
    if (!type.trim() || type.length > 80) throw new Error("History event type is invalid");
    const history = hydrateTrainingHistory(historyValue);
    const prior = latestEvent(history, collection, date);
    const occurredAt = options.occurredAt || (/* @__PURE__ */ new Date()).toISOString();
    const event = sanitizeEvent({
      id: createId("history"),
      collection,
      date,
      type,
      occurredAt,
      revision: (prior?.revision || 0) + 1,
      supersedesId: options.supersedesId ?? prior?.id ?? "",
      payload: clonePayload(payload),
      uploadedAt: ""
    });
    if (!event) throw new Error("History event could not be created");
    return hydrateTrainingHistory({ schemaVersion: 1, events: [...history.events, event] });
  }
  function mergeTrainingHistories(remoteValue, localValue) {
    const remote = hydrateTrainingHistory(remoteValue);
    const local = hydrateTrainingHistory(localValue);
    return hydrateTrainingHistory({ schemaVersion: 1, events: [...remote.events, ...local.events] });
  }
  function pendingHistoryEvents(historyValue) {
    return hydrateTrainingHistory(historyValue).events.filter((event) => !event.uploadedAt);
  }
  function markHistoryEventsUploaded(historyValue, ids, uploadedAt) {
    const idSet = new Set(ids);
    const history = hydrateTrainingHistory(historyValue);
    return hydrateTrainingHistory({
      schemaVersion: 1,
      events: history.events.map((event) => idSet.has(event.id) ? { ...event, uploadedAt } : event)
    });
  }
  function importRemoteHistoryEvents(historyValue, events, uploadedAt = (/* @__PURE__ */ new Date()).toISOString()) {
    const incoming = events.map((event) => isRecord(event) ? { ...event, uploadedAt } : event);
    return mergeTrainingHistories(historyValue, { schemaVersion: 1, events: incoming });
  }
  function latestPlanPayload(historyValue, date) {
    return latestEvent(hydrateTrainingHistory(historyValue), "planSnapshots", date)?.payload || null;
  }
  return __toCommonJS(training_history_exports);
})();
