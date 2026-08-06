import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState, IsoDate } from "../../src/domain/state";
import { LoadResult, loadAppState, migrateIfNeeded, saveAppState } from "../../src/domain/storage";
import { ReadinessSubmission, PlanState, planStateForDate } from "../../src/domain/session";

/**
 * Bridges the pure storage layer to React.
 *
 * All the data rules live in src/domain — this hook only owns React state and
 * persistence timing, so the logic stays testable without a renderer.
 */

function browserStorage() {
  return {
    getItem: (key: string) => window.localStorage.getItem(key),
    setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
    removeItem: (key: string) => window.localStorage.removeItem(key),
  };
}

export interface AppStateHandle {
  state: AppState | null;
  /** Set when stored data could not be read; the original is backed up. */
  load: LoadResult | null;
  update: (mutate: (draft: AppState) => AppState) => void;
  submissions: Record<IsoDate, ReadinessSubmission | undefined>;
  planFor: (date: IsoDate) => PlanState;
}

export function useAppState(): AppStateHandle {
  const [load, setLoad] = useState<LoadResult | null>(null);
  const [state, setState] = useState<AppState | null>(null);

  useEffect(() => {
    const storage = browserStorage();
    // Adopt legacy data before the first read, never overwriting newer data.
    migrateIfNeeded(storage);
    const result = loadAppState(storage);
    setLoad(result);
    setState(result.state);
  }, []);

  const update = useCallback((mutate: (draft: AppState) => AppState) => {
    setState((current) => {
      if (!current) return current;
      const next = mutate(current);
      try {
        saveAppState(browserStorage(), next);
      } catch (error) {
        // A refused save means the on-device data is newer than this build
        // understands. Keeping the in-memory change but not persisting is the
        // safe half-step: nothing on disk is clobbered.
        console.error("Refused to persist state:", error);
      }
      return next;
    });
  }, []);

  const submissions = useMemo(
    () => (state?.pre ?? {}) as Record<IsoDate, ReadinessSubmission | undefined>,
    [state]
  );

  const planFor = useCallback((date: IsoDate) => planStateForDate(submissions, date), [submissions]);

  return { state, load, update, submissions, planFor };
}

// Deliberately no `todayIso` here. "Today" comes from
// `programmeSessions.currentSelection()`, which resolves in the programme's
// timezone. A second device-clock version existed briefly and caused the
// session and the saved record to disagree by a day.
