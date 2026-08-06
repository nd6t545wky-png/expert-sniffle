/**
 * Validated JSON import/export.
 *
 * Import is all-or-nothing: a file is either accepted whole or rejected with
 * reasons. There is no partial application, because half-applied data is
 * worse than a clear failure.
 */

import {
  AppState,
  ParseIssue,
  SCHEMA_VERSION,
  countRecords,
  parseAppState,
  withoutEphemeral,
} from "./state";

export const EXPORT_FORMAT = "dylan-pitching-os.export";
export const EXPORT_FORMAT_VERSION = 1;

export interface ExportEnvelope {
  format: typeof EXPORT_FORMAT;
  formatVersion: number;
  schemaVersion: number;
  exportedAt: string;
  recordCount: number;
  state: AppState;
}

export function exportAppState(state: AppState, now: Date = new Date()): ExportEnvelope {
  const payload = withoutEphemeral(state);
  return {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    schemaVersion: state.version ?? SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    recordCount: countRecords(payload),
    state: payload,
  };
}

export function serializeExport(state: AppState, now: Date = new Date()): string {
  return JSON.stringify(exportAppState(state, now), null, 2);
}

export interface ImportResult {
  ok: boolean;
  state?: AppState;
  recordCount?: number;
  /** Fatal problems — present exactly when `ok` is false. */
  errors: ParseIssue[];
  /** Non-fatal observations worth showing the user. */
  warnings: ParseIssue[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Validate and decode an export file.
 *
 * Accepts either a full envelope or a bare state object, so a hand-edited or
 * older file is still importable. Rejects anything from a newer format or
 * schema than this build understands, rather than guessing at its meaning.
 */
export function importAppState(raw: string): ImportResult {
  const errors: ParseIssue[] = [];
  const warnings: ParseIssue[] = [];

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch (error) {
    return {
      ok: false,
      errors: [{ path: "", message: `File is not valid JSON: ${error instanceof Error ? error.message : String(error)}` }],
      warnings,
    };
  }

  if (!isPlainObject(decoded)) {
    return { ok: false, errors: [{ path: "", message: "File must contain a JSON object." }], warnings };
  }

  let candidate: unknown = decoded;

  if (decoded.format !== undefined || decoded.state !== undefined) {
    if (decoded.format !== EXPORT_FORMAT) {
      errors.push({ path: "format", message: `Unrecognised export format: ${String(decoded.format)}` });
    }
    if (typeof decoded.formatVersion === "number" && decoded.formatVersion > EXPORT_FORMAT_VERSION) {
      errors.push({
        path: "formatVersion",
        message: `File uses export format v${decoded.formatVersion}; this build understands v${EXPORT_FORMAT_VERSION}.`,
      });
    }
    if (!isPlainObject(decoded.state)) {
      errors.push({ path: "state", message: "Envelope is missing its `state` object." });
    }
    candidate = decoded.state;
  } else {
    warnings.push({ path: "", message: "File has no export envelope; treating it as a bare state object." });
  }

  if (errors.length) return { ok: false, errors, warnings };

  const { state, issues } = parseAppState(candidate);
  if (!state) return { ok: false, errors: issues, warnings };

  if (typeof state.version === "number" && state.version > SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [
        {
          path: "state.version",
          message: `File was written by a newer version of the app (schema v${state.version}); this build understands v${SCHEMA_VERSION}.`,
        },
      ],
      warnings,
    };
  }

  warnings.push(...issues);

  const recordCount = countRecords(state);
  if (isPlainObject(decoded) && typeof decoded.recordCount === "number" && decoded.recordCount !== recordCount) {
    warnings.push({
      path: "recordCount",
      message: `File declares ${decoded.recordCount} records but contains ${recordCount}.`,
    });
  }

  return { ok: true, state, recordCount, errors: [], warnings };
}
