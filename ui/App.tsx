import { useCallback, useEffect, useMemo, useState } from "react";
import { IsoDate } from "../src/domain/state";
import { ReadinessSubmission, SessionReport, ThrowIntent, totalThrowLoad } from "../src/domain/session";
import { computeReadiness } from "../src/domain/readiness";
import { PitchingOsApi } from "../src/domain/api";
import { isValidSyncKey } from "../src/domain/sync";
import { syncNow } from "../src/domain/cloudSync";
import {
  Session,
  buildSession,
  currentSelection,
  setProgrammeContext,
  weekPlan,
} from "../src/domain/programmeSessions";
import { useAppState } from "./state/useAppState";
import { useAppearance } from "./state/useAppearance";
import { Dashboard } from "./components/Dashboard";
import { PageId, Shell } from "./components/Shell";
import { DailyPlan, PlanTask } from "./components/DailyPlan";
import { HealthForm } from "./components/HealthForm";
import { Workload, ThrowingEntry } from "./components/Workload";
import { Tracking } from "./components/Tracking";
import { AnnualPlan } from "./components/AnnualPlan";
import { Account } from "./components/Account";
import { Integrations } from "./components/Integrations";
import { Mechanics } from "./components/Mechanics";
import { Meal, Nutrition, NutritionTargets } from "./components/Nutrition";

type Page = PageId;

const SYNC_KEY_STORAGE = "dylan-pitching-os-sync-key-v1";

const DEFAULT_TARGETS: NutritionTargets = { calories: 0, protein: 0, carbs: 0, fat: 0, fluid: 0 };

export function App() {
  const { state, load, update, submissions, planFor } = useAppState();
  const [page, setPage] = useState<Page>("dashboard");
  // One source of truth for "today" — date, week and day must agree, or a
  // readiness entry lands on a different day than the session it unlocked.
  const [today] = useState(() => currentSelection());
  const date = today.openDate;
  const [selectedWeek, setSelectedWeek] = useState(today.selectedWeek);
  const selectedDay = today.selectedDay;
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

  // Every design preference (appearance, glass, density, motion, navigation)
  // is applied to <html>, which is what styles.css keys off.
  useAppearance(state?.profile as never);

  const plan = planFor(date);
  const submission = submissions[date];

  const throwingEntries = useMemo<ThrowingEntry[]>(() => {
    const bullpens = (state?.bullpens ?? {}) as Record<IsoDate, ThrowingEntry | undefined>;
    return Object.values(bullpens).filter(Boolean) as ThrowingEntry[];
  }, [state]);

  const reports = (state?.post ?? {}) as Record<IsoDate, SessionReport | undefined>;

  // The programme's prescriptions depend on training maxes and on Friday's
  // game pitch count, so give it those before building a session.
  useEffect(() => {
    setProgrammeContext({
      pbs: state?.pbs as never,
      post: state?.post as never,
    });
  }, [state]);

  const session = useMemo<Session | null>(() => {
    if (!state) return null;
    try {
      const plan = weekPlan(selectedWeek, state.pbs);
      return buildSession(plan, selectedDay, {
        risk: submission?.risk,
        adjustment: submission
          ? { planLevel: submission.planLevel, workloadFactor: submission.workloadFactor }
          : null,
      });
    } catch {
      return null;
    }
  }, [state, selectedWeek, selectedDay, submission]);

  const tasks = useMemo<PlanTask[]>(
    () =>
      (session?.tasks ?? []).map((task) => ({
        id: task.id,
        name: task.name,
        prescription: task.prescription,
      })),
    [session]
  );
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
    setPage("session");
  }

  function updateNutrition(mutate: (current: typeof nutrition) => typeof nutrition) {
    update((draft) => {
      const current = (draft.nutrition ?? {}) as typeof nutrition;
      return { ...draft, nutrition: mutate(current) };
    });
  }

  const weekMeta = (() => {
    try {
      const plan = weekPlan(selectedWeek, state?.pbs);
      const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
        new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Brisbane", ...opts }).format(d);
      const dayDate = new Date(`${date}T00:00:00+10:00`);
      return {
        eyebrow: `Week ${plan.week} · ${plan.phase.name}`,
        heading: fmt(dayDate, { weekday: "long", day: "numeric", month: "long" }),
        range: `${fmt(plan.start, { day: "numeric", month: "short" })} – ${fmt(plan.end, {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}`,
        focus: plan.focus ?? "",
        phaseId: plan.phase.id,
      };
    } catch {
      return { eyebrow: "", heading: date, range: "", focus: "", phaseId: "winter" };
    }
  })();

  const winter = !["summer_first", "summer_second", "summer_break", "transition_summer"].includes(
    weekMeta.phaseId
  );
  const profile = (state.profile ?? {}) as { winterTeam?: string; summerTeam?: string };
  const team = winter
    ? { name: profile.winterTeam || "Norths", logo: "/assets/norths-baseball-logo.jpg", alt: "Norths Baseball Club logo", theme: "theme-norths" }
    : { name: profile.summerTeam || "Coomera Cubs", logo: "/assets/coomera-cubs-logo.png", alt: "Coomera Cubs Baseball Club logo", theme: "theme-cubs" };

  return (
    <Shell
      theme={team.theme}
      desktopContext={weekMeta.eyebrow}
      mobileContext="Today"
      contextRange={weekMeta.range}
      syncLabel={syncKey ? "Synced" : "Local only"}
      syncStatus={syncKey ? "synced" : "local"}
      appearance={String((state.profile as { appearance?: string })?.appearance ?? "system")}
      athleteName={String((state.profile as { name?: string })?.name ?? "Athlete")}
      onCycleAppearance={() =>
        update((draft) => {
          const current = (draft.profile ?? {}) as { appearance?: string };
          const order = ["system", "light", "dark"];
          const next = order[(order.indexOf(current.appearance ?? "system") + 1) % order.length];
          return { ...draft, profile: { ...current, appearance: next } };
        })
      }
      page={page}
      onNavigate={setPage}
      onOpenPlan={() => setPage(plan.status === "locked" ? "readiness" : "session")}
    >
      {page === "dashboard" && (
        <Dashboard
          date={date}
          plan={plan}
          submission={submission}
          eyebrow={weekMeta.eyebrow}
          heading={weekMeta.heading}
          focus={weekMeta.focus}
          teamName={team.name}
          teamLogo={team.logo}
          teamLogoAlt={team.alt}
          sessionTitle={String(session?.title ?? "").replace(/^[A-Za-z]+ · /, "") || "Session"}
          sessionDescription={String(session?.description ?? "")}
          sessionDuration={String(session?.duration ?? "—")}
          sessionStress={String(session?.stress ?? "—")}
          taskCount={tasks.length}
          completedCount={(completed[date] ?? []).length}
          weekLoad={weekLoad}
          hydrationLitres={hydrationLitres}
          fluidTarget={targets.fluid}
          onNavigate={setPage}
          onOpenPlan={() => setPage(plan.status === "locked" ? "readiness" : "session")}
        />
      )}
      {page === "session" && (
        <DailyPlan
          date={date}
          plan={plan}
          submission={submission}
          onOpenReadiness={() => setPage("readiness")}
          tasks={tasks}
          sessionTitle={session?.title}
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
                // Removing more than was logged clears the day rather than
                // storing a negative volume.
                [date]:
                  litres === "reset"
                    ? 0
                    : Math.max(0, Number(((current.hydration?.[date] ?? 0) + litres).toFixed(2))),
              },
            }))
          }
        />
      )}

      {page === "mechanics" && <Mechanics api={api} date={date} hasSyncKey={isValidSyncKey(syncKey)} />}

      {page === "integrations" && <Integrations api={api} hasSyncKey={isValidSyncKey(syncKey)} />}

      {/* The sections the five-item bottom nav cannot hold are reached through
          the shell's "More" sheet, as in the prototype — not through a nav list
          rendered into the page body. */}
      {page === "profile" && (
        <Account
          api={api}
          syncKey={syncKey}
          onSyncKey={setSyncKey}
          onSyncNow={handleSyncNow}
          syncStatus={syncStatus}
        />
      )}
    </Shell>
  );
}

export type { Page, ThrowIntent };
