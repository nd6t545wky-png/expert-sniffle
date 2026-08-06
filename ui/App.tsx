import { useMemo, useState } from "react";
import { IsoDate } from "../src/domain/state";
import { ReadinessSubmission, SessionReport, ThrowIntent, totalThrowLoad } from "../src/domain/session";
import { computeReadiness } from "../src/domain/readiness";
import { useAppState, todayIso } from "./state/useAppState";
import { Dashboard } from "./components/Dashboard";
import { DailyPlan, PlanTask } from "./components/DailyPlan";
import { HealthForm } from "./components/HealthForm";
import { Workload, ThrowingEntry } from "./components/Workload";
import { Tracking } from "./components/Tracking";
import { AnnualPlan } from "./components/AnnualPlan";

type Page = "dashboard" | "plan" | "readiness" | "workload" | "tracking" | "annual";

const PAGES: [Page, string][] = [
  ["dashboard", "Dashboard"],
  ["plan", "Session"],
  ["readiness", "Readiness"],
  ["workload", "Workload"],
  ["tracking", "Tracking"],
  ["annual", "Annual"],
];

/** Placeholder session tasks until the programme's per-week prescriptions are ported. */
const TASKS: PlanTask[] = [
  { id: "warmup", name: "Warm-up", prescription: "Band series, mobility, run poles" },
  { id: "throwing", name: "Throwing", prescription: "Per today's intent and plan level" },
  { id: "lift", name: "Lift", prescription: "Per phase strength block" },
  { id: "recovery", name: "Recovery", prescription: "Cuff, cooldown, hydration" },
];

export function App() {
  const { state, load, update, submissions, planFor } = useAppState();
  const [page, setPage] = useState<Page>("dashboard");
  const [date] = useState<IsoDate>(() => todayIso());
  const [selectedWeek, setSelectedWeek] = useState(1);

  const plan = planFor(date);
  const submission = submissions[date];

  const throwingEntries = useMemo<ThrowingEntry[]>(() => {
    const bullpens = (state?.bullpens ?? {}) as Record<IsoDate, ThrowingEntry | undefined>;
    return Object.values(bullpens).filter(Boolean) as ThrowingEntry[];
  }, [state]);

  const reports = (state?.post ?? {}) as Record<IsoDate, SessionReport | undefined>;
  const completed = (state?.completedTasks ?? {}) as Record<IsoDate, string[] | undefined>;
  const weekLoad = totalThrowLoad(throwingEntries.slice(-7));

  if (load?.source === "corrupt") {
    return (
      <main className="app">
        <div className="alert danger" role="alert">
          <strong>Saved data could not be read.</strong>
          <p>
            Nothing has been deleted — the original was copied to{" "}
            <code>{load.backupKey}</code> before anything else happened.
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
            update((draft) => ({ ...draft, completedTasks: { ...draft.completedTasks, [forDate]: next } }))
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
          onReport={(report) =>
            update((draft) => ({ ...draft, post: { ...draft.post, [report.date]: report } }))
          }
        />
      )}

      {page === "annual" && <AnnualPlan selectedWeek={selectedWeek} onSelectWeek={setSelectedWeek} />}
    </main>
  );
}

export type { Page, ThrowIntent };
