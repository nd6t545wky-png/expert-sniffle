import { useCallback, useEffect, useMemo, useState } from "react";
import { IsoDate } from "../src/domain/state";
import { ReadinessSubmission, SessionReport, ThrowIntent, totalThrowLoad } from "../src/domain/session";
import { computeReadiness } from "../src/domain/readiness";
import { PitchingOsApi } from "../src/domain/api";
import { isValidSyncKey } from "../src/domain/sync";
import { syncNow } from "../src/domain/cloudSync";
import { useAppState, todayIso } from "./state/useAppState";
import { Dashboard } from "./components/Dashboard";
import { DailyPlan, PlanTask } from "./components/DailyPlan";
import { HealthForm } from "./components/HealthForm";
import { Workload, ThrowingEntry } from "./components/Workload";
import { Tracking } from "./components/Tracking";
import { AnnualPlan } from "./components/AnnualPlan";
import { Account } from "./components/Account";
import { Integrations } from "./components/Integrations";
import { Mechanics } from "./components/Mechanics";
import { Meal, Nutrition, NutritionTargets } from "./components/Nutrition";

type Page =
  | "dashboard"
  | "plan"
  | "readiness"
  | "workload"
  | "tracking"
  | "annual"
  | "nutrition"
  | "mechanics"
  | "integrations"
  | "account";

const PAGES: [Page, string][] = [
  ["dashboard", "Dashboard"],
  ["plan", "Session"],
  ["readiness", "Readiness"],
  ["workload", "Workload"],
  ["tracking", "Tracking"],
  ["annual", "Annual"],
  ["nutrition", "Nutrition"],
  ["mechanics", "Mechanics"],
  ["integrations", "Integrations"],
  ["account", "Account"],
];

const SYNC_KEY_STORAGE = "dylan-pitching-os-sync-key-v1";

/** Placeholder session tasks until the per-week prescriptions are ported. */
const TASKS: PlanTask[] = [
  { id: "warmup", name: "Warm-up", prescription: "Band series, mobility, run poles" },
  { id: "throwing", name: "Throwing", prescription: "Per today's intent and plan level" },
  { id: "lift", name: "Lift", prescription: "Per phase strength block" },
  { id: "recovery", name: "Recovery", prescription: "Cuff, cooldown, hydration" },
];

const DEFAULT_TARGETS: NutritionTargets = { calories: 0, protein: 0, carbs: 0, fat: 0, fluid: 0 };

export function App() {
  const { state, load, update, submissions, planFor } = useAppState();
  const [page, setPage] = useState<Page>("dashboard");
  const [date] = useState<IsoDate>(() => todayIso());
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [syncKey, setSyncKeyState] = useState("");
  const [syncStatus, setSyncStatus] = useState("");

  useEffect(() => {
    const stored = window.localStorage.getItem(SYNC_KEY_STORAGE) || "";
    if (isValidSyncKey(stored)) setSyncKeyState(stored);
  }, []);

  const api = useMemo(() => new PitchingOsApi({ syncKey: syncKey || undefined }), [syncKey]);

  const setSyncKey = useCallback((key: string) => {
    setSyncKeyState(key);
    window.localStorage.setItem(SYNC_KEY_STORAGE, key);
  }, []);

  const plan = planFor(date);
  const submission = submissions[date];

  const throwingEntries = useMemo<ThrowingEntry[]>(() => {
    const bullpens = (state?.bullpens ?? {}) as Record<IsoDate, ThrowingEntry | undefined>;
    return Object.values(bullpens).filter(Boolean) as ThrowingEntry[];
  }, [state]);

  const reports = (state?.post ?? {}) as Record<IsoDate, SessionReport | undefined>;
  const completed = (state?.completedTasks ?? {}) as Record<IsoDate, string[] | undefined>;
  const weekLoad = totalThrowLoad(throwingEntries.slice(-7));

  const nutrition = (state?.nutrition ?? {}) as {
    meals?: Record<IsoDate, Meal[]>;
    hydration?: Record<IsoDate, number>;
    targets?: NutritionTargets;
  };
  const meals = nutrition.meals?.[date] ?? [];
  const hydrationLitres = Number(nutrition.hydration?.[date] ?? 0);
  const targets = { ...DEFAULT_TARGETS, ...(nutrition.targets ?? {}) };

  const handleSyncNow = useCallback(async () => {
    if (!state || !isValidSyncKey(syncKey)) return;
    setSyncStatus("Syncing…");
    const outcome = await syncNow({ api, syncKey }, state);
    if (outcome.status === "failed") {
      setSyncStatus(`Sync failed: ${outcome.message}`);
      return;
    }
    if (outcome.changed) update(() => outcome.state);
    setSyncStatus(
      outcome.status === "conflict-resolved"
        ? "Merged with another device's newer data."
        : `Synced at ${new Date().toLocaleTimeString()}`
    );
  }, [api, state, syncKey, update]);

  if (load?.source === "corrupt") {
    return (
      <main className="app">
        <div className="alert danger" role="alert">
          <strong>Saved data could not be read.</strong>
          <p>
            Nothing has been deleted — the original was copied to <code>{load.backupKey}</code> before
            anything else happened.
          </p>
        </div>
      </main>
    );
  }

  if (!state) return <main className="app">Loading…</main>;

  function handleReadinessSubmitted(result: ReturnType<typeof computeReadiness>, forDate: IsoDate) {
    update((draft) => {
      const next: ReadinessSubmission = {
        date: forDate,
        score: result.score,
        risk: result.risk,
        planLevel: result.planLevel,
        workloadFactor: result.workloadFactor,
        submittedAt: new Date().toISOString(),
      };
      return { ...draft, pre: { ...draft.pre, [forDate]: next } };
    });
    setPage("plan");
  }

  function updateNutrition(mutate: (current: typeof nutrition) => typeof nutrition) {
    update((draft) => {
      const current = (draft.nutrition ?? {}) as typeof nutrition;
      return { ...draft, nutrition: mutate(current) };
    });
  }

  return (
    <main className="app">
      <header>
        <h1>Pitching OS</h1>
      </header>

      <nav aria-label="Sections">
        {PAGES.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={page === id ? "nav-item active" : "nav-item"}
            aria-current={page === id ? "page" : undefined}
            onClick={() => setPage(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {page === "dashboard" && (
        <Dashboard
          date={date}
          plan={plan}
          submission={submission}
          selectedWeek={selectedWeek}
          weekLoad={weekLoad}
          onGoToReadiness={() => setPage("readiness")}
        />
      )}

      {page === "plan" && (
        <DailyPlan
          date={date}
          plan={plan}
          submission={submission}
          tasks={TASKS}
          completed={completed}
          onCompleteTask={(forDate, _taskId, next) =>
            update((draft) => ({
              ...draft,
              completedTasks: { ...draft.completedTasks, [forDate]: next },
              taskCompletionUpdatedAt: {
                ...draft.taskCompletionUpdatedAt,
                [forDate]: new Date().toISOString(),
              },
            }))
          }
          onOverride={(forDate, override) =>
            update((draft) => {
              const current = draft.pre[forDate] as ReadinessSubmission | undefined;
              if (!current) return draft;
              return { ...draft, pre: { ...draft.pre, [forDate]: { ...current, manualOverride: override } } };
            })
          }
        />
      )}

      {page === "readiness" && (
        <HealthForm date={date} plan={plan} existing={state.pre} onSubmitted={handleReadinessSubmitted} />
      )}

      {page === "workload" && (
        <Workload
          date={date}
          plan={plan}
          entries={throwingEntries}
          onLog={(entry) =>
            update((draft) => ({ ...draft, bullpens: { ...draft.bullpens, [entry.date]: entry } }))
          }
        />
      )}

      {page === "tracking" && (
        <Tracking
          date={date}
          plan={plan}
          reports={reports}
          onReport={(report) => update((draft) => ({ ...draft, post: { ...draft.post, [report.date]: report } }))}
        />
      )}

      {page === "annual" && <AnnualPlan selectedWeek={selectedWeek} onSelectWeek={setSelectedWeek} />}

      {page === "nutrition" && (
        <Nutrition
          api={api}
          date={date}
          meals={meals}
          hydrationLitres={hydrationLitres}
          targets={targets}
          onAddMeal={(meal) =>
            updateNutrition((current) => ({
              ...current,
              meals: { ...(current.meals ?? {}), [date]: [...(current.meals?.[date] ?? []), meal] },
            }))
          }
          onRemoveMeal={(id) =>
            updateNutrition((current) => ({
              ...current,
              meals: {
                ...(current.meals ?? {}),
                [date]: (current.meals?.[date] ?? []).filter((meal) => meal.id !== id),
              },
            }))
          }
          onHydration={(litres) =>
            updateNutrition((current) => ({
              ...current,
              hydration: {
                ...(current.hydration ?? {}),
                [date]: Number(((current.hydration?.[date] ?? 0) + litres).toFixed(2)),
              },
            }))
          }
        />
      )}

      {page === "mechanics" && <Mechanics api={api} date={date} hasSyncKey={isValidSyncKey(syncKey)} />}

      {page === "integrations" && <Integrations api={api} hasSyncKey={isValidSyncKey(syncKey)} />}

      {page === "account" && (
        <Account
          api={api}
          syncKey={syncKey}
          onSyncKey={setSyncKey}
          onSyncNow={handleSyncNow}
          syncStatus={syncStatus}
        />
      )}
    </main>
  );
}

export type { Page, ThrowIntent };
