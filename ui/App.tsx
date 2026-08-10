import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IsoDate } from "../src/domain/state";
import {
  DAY_NAMES,
  ReadinessSubmission,
  SessionReport,
  SkippedTask,
  ThrowIntent,
  totalThrowLoad,
} from "../src/domain/session";
import { computeReadiness } from "../src/domain/readiness";
import { PitchingOsApi } from "../src/domain/api";
import { isValidSyncKey } from "../src/domain/sync";
import { syncNow } from "../src/domain/cloudSync";
import {
  Session,
  buildSession,
  currentSelection,
  dateForWeekDay,
  setProgrammeContext,
  weekPlan,
} from "../src/domain/programmeSessions";
import { applyBaselineProgramming } from "../src/domain/programmeUpdates";
import { seedBaselinePbs } from "../src/domain/baseline";
import { useAppState } from "./state/useAppState";
import { useAppearance } from "./state/useAppearance";
import { Dashboard } from "./components/Dashboard";
import { PageId, Shell } from "./components/Shell";
import { DailyPlan, PlanTask } from "./components/DailyPlan";
import { DayTab, dayStatus } from "./components/DayTabs";
import { HealthForm } from "./components/HealthForm";
import { Workload, ThrowingEntry } from "./components/Workload";
import { Tracking } from "./components/Tracking";
import { AnnualPlan } from "./components/AnnualPlan";
import { Account } from "./components/Account";
import { BaselineTesting } from "./components/BaselineTesting";
import { Integrations } from "./components/Integrations";
import { Mechanics } from "./components/Mechanics";
import { Meal, Nutrition, NutritionTargets } from "./components/Nutrition";

type Page = PageId;

const SYNC_KEY_STORAGE = "dylan-pitching-os-sync-key-v1";
const PAGE_STORAGE = "dylan-pitching-os-page-v1";

/** Quiet period after the last change before autosave uploads. */
const AUTOSAVE_DELAY_MS = 1500;

/**
 * Pages that are about today rather than about whatever is being browsed.
 * Nutrition is here with the dashboard because the dashboard's hydration tile
 * links straight to it — if one meant today and the other meant the browsed
 * week, the number would change on the way through.
 */
const TODAY_PAGES: Page[] = ["dashboard", "nutrition"];

/** The topbar's short context line on a phone, as v60's PAGE_TITLES. */
const PAGE_TITLES: Record<Page, string> = {
  dashboard: "Today",
  session: "Daily plan",
  readiness: "Health check-in",
  workload: "Throwing workload",
  tracking: "Progress",
  annual: "Annual plan",
  nutrition: "Nutrition",
  mechanics: "Biomechanics",
  integrations: "Connections",
  profile: "Athlete",
};

const PAGE_IDS: Page[] = [
  "dashboard",
  "session",
  "readiness",
  "workload",
  "tracking",
  "annual",
  "nutrition",
  "mechanics",
  "integrations",
  "profile",
];

const DEFAULT_TARGETS: NutritionTargets = { calories: 0, protein: 0, carbs: 0, fat: 0, fluid: 0 };

export function App() {
  const { state, load, update, submissions, planFor } = useAppState();
  // Remembering the open page is what stops a reload — or a service-worker
  // update, which reloads without asking — from dropping the athlete back on
  // the dashboard mid-session. sessionStorage, not localStorage: a genuinely
  // new visit should still start at Today.
  const [page, setPage] = useState<Page>(() => {
    try {
      const stored = window.sessionStorage.getItem(PAGE_STORAGE);
      return stored && PAGE_IDS.includes(stored as Page) ? (stored as Page) : "dashboard";
    } catch {
      return "dashboard";
    }
  });

  useEffect(() => {
    try {
      window.sessionStorage.setItem(PAGE_STORAGE, page);
    } catch {
      // A blocked storage quota must not take the app down.
    }
  }, [page]);
  // One source of truth for "which day am I looking at".
  //
  // The selection is a (week, day) pair and the date is *derived* from it —
  // never stored alongside it. That is what stops the heading and the date
  // from disagreeing: there is no second value that can fall out of step, so
  // moving weeks or days cannot leave a readiness entry filed under one date
  // while the session it unlocked is shown for another.
  const [today] = useState(() => currentSelection());
  const [selection, setSelection] = useState(() => ({
    week: today.selectedWeek,
    day: today.selectedDay,
  }));
  // Some pages always mean today, whatever week or day is being browsed —
  // "Today" showing week 30 because the annual plan was left open there is
  // not a view of today. The browsing position is kept, not discarded: it is
  // simply not what these pages are about.
  //
  // This stays a single derivation. What is being viewed is one (week, day)
  // pair chosen by the open page, and the date, session, phase, team colours
  // and topbar context all come from it — so they cannot disagree with each
  // other any more than they could before.
  const viewing = TODAY_PAGES.includes(page)
    ? { week: today.selectedWeek, day: today.selectedDay }
    : selection;
  const selectedWeek = viewing.week;
  const selectedDay = viewing.day;

  const setSelectedWeek = useCallback(
    (week: number) => setSelection((current) => ({ ...current, week })),
    []
  );
  const setSelectedDay = useCallback(
    (day: number) => setSelection((current) => ({ ...current, day })),
    []
  );

  /** Snap the browsing position back to today, then go somewhere. */
  const goToToday = useCallback(
    (target: Page) => {
      setSelection({ week: today.selectedWeek, day: today.selectedDay });
      setPage(target);
    },
    [today]
  );
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

  // The week the selection points at, and the date derived from it. Every
  // other date in the app flows from here.
  const selectedWeekPlan = useMemo(() => {
    try {
      return weekPlan(selectedWeek, state?.pbs);
    } catch {
      return null;
    }
  }, [selectedWeek, state?.pbs]);

  const date: IsoDate = selectedWeekPlan
    ? dateForWeekDay(selectedWeekPlan, selectedDay)
    : today.openDate;
  const isToday = date === today.openDate;

  const plan = planFor(date);
  const submission = submissions[date];

  const throwingEntries = useMemo<ThrowingEntry[]>(() => {
    const bullpens = (state?.bullpens ?? {}) as Record<IsoDate, ThrowingEntry | undefined>;
    return Object.values(bullpens).filter(Boolean) as ThrowingEntry[];
  }, [state]);

  const reports = (state?.post ?? {}) as Record<IsoDate, SessionReport | undefined>;

  // Put the measured back-squat max where the programme looks for it. Guarded
  // by seedBaselinePbs, which never overwrites an existing entry, and by the
  // equality check, so this runs once rather than on every state change.
  useEffect(() => {
    if (!state) return;
    const seeded = seedBaselinePbs(state);
    if (seeded !== state) update(() => seeded as typeof state);
  }, [state, update]);

  // The programme's prescriptions depend on training maxes and on Friday's
  // game pitch count, so give it those before building a session.
  useEffect(() => {
    setProgrammeContext({
      pbs: state?.pbs as never,
      post: state?.post as never,
    });
  }, [state]);

  const session = useMemo<Session | null>(() => {
    if (!state || !selectedWeekPlan) return null;
    try {
      // The programme's own session, then the adjustments driven by the
      // athlete's testing reports. Readiness scaling has already been applied
      // by buildSession, so the additions inherit the day's intent.
      return applyBaselineProgramming(
        buildSession(selectedWeekPlan, selectedDay, {
          risk: submission?.risk,
          adjustment: submission
            ? { planLevel: submission.planLevel, workloadFactor: submission.workloadFactor }
            : null,
        })
      );
    } catch {
      return null;
    }
  }, [state, selectedWeekPlan, selectedDay, submission]);

  // The plan renders stages, cues and detail panels, so it needs the whole
  // task, not a name/prescription pair.
  const tasks = useMemo<PlanTask[]>(() => session?.tasks ?? [], [session]);
  const completed = (state?.completedTasks ?? {}) as Record<IsoDate, string[] | undefined>;
  const skippedTasks = (state?.skippedTasks ?? {}) as Record<
    IsoDate,
    Record<string, SkippedTask> | undefined
  >;
  const weekLoad = totalThrowLoad(throwingEntries.slice(-7));

  // The week's seven days. Each tab's date comes from the same
  // `dateForWeekDay` derivation that produces `date`, so a tab can never point
  // at a different day than the one the page then shows.
  const dayTabs = useMemo<DayTab[]>(() => {
    if (!selectedWeekPlan) return [];
    const pre = (state?.pre ?? {}) as Record<IsoDate, unknown>;
    const post = (state?.post ?? {}) as Record<IsoDate, unknown>;
    return DAY_NAMES.map((name, day) => {
      const tabDate = dateForWeekDay(selectedWeekPlan, day);
      return { day, date: tabDate, name, status: dayStatus(tabDate, pre, post) };
    });
  }, [selectedWeekPlan, state]);

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

  // --- Autosave ------------------------------------------------------------
  //
  // Local changes reach the encrypted cloud snapshot on their own. Two things
  // keep this from thrashing or looping:
  //
  //  * a debounce, so a slider dragged across ten values is one upload; and
  //  * a fingerprint of what was last sent, because a successful sync can
  //    itself change local state (a merge), and syncing that back immediately
  //    would spin forever.
  //
  // A failure is left for the next change or a manual "Sync now" to retry —
  // it is reported, never silently swallowed, and never blocks local work.
  const lastSynced = useRef<string>("");
  const syncing = useRef(false);

  useEffect(() => {
    if (!state || !isValidSyncKey(syncKey)) return;
    const fingerprint = JSON.stringify(state);
    if (fingerprint === lastSynced.current || syncing.current) return;

    const timer = window.setTimeout(async () => {
      syncing.current = true;
      setSyncStatus("Saving…");
      try {
        const outcome = await syncNow({ api, syncKey }, state);
        if (outcome.status === "failed") {
          setSyncStatus(`Autosave failed: ${outcome.message}`);
          return;
        }
        // Record what went up *before* applying a merge, so the merged result
        // does not immediately look like a fresh local change.
        lastSynced.current = fingerprint;
        if (outcome.changed) {
          lastSynced.current = JSON.stringify(outcome.state);
          update(() => outcome.state);
        }
        setSyncStatus(
          outcome.status === "conflict-resolved"
            ? "Merged with another device's newer data."
            : `Saved ${new Date().toLocaleTimeString()}`
        );
      } finally {
        syncing.current = false;
      }
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
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
      // Reuse the derived plan rather than recomputing it — a second lookup is
      // a second thing that can disagree with the first.
      const plan = selectedWeekPlan;
      if (!plan) throw new Error("no plan");
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
      mobileContext={PAGE_TITLES[page]}
      contextRange={weekMeta.range}
      syncLabel={syncKey ? "Synced" : "Local only"}
      syncStatus={syncKey ? "synced" : "local"}
      appearance={String((state.profile as { appearance?: string })?.appearance ?? "system")}
      athleteName={String((state.profile as { name?: string })?.name ?? "Athlete")}
      athleteDetail={(() => {
        const p = state.profile as { throwingHand?: string; weight?: number | string } | undefined;
        const hand = p?.throwingHand === "Left" ? "LHP" : "RHP";
        return p?.weight ? `${hand} · ${p.weight} kg` : hand;
      })()}
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
          // The dashboard is about today, so what it sends you to is today —
          // otherwise "check-in required" would open the check-in for a week
          // left open on the annual plan.
          onNavigate={goToToday}
          onOpenPlan={() => goToToday(plan.status === "locked" ? "readiness" : "session")}
        />
      )}
      {page === "session" && (
        <DailyPlan
          date={date}
          plan={plan}
          submission={submission}
          onOpenReadiness={() => setPage("readiness")}
          onOpenCheckout={() => setPage("tracking")}
          dayTabs={dayTabs}
          selectedDay={selectedDay}
          today={today.openDate}
          onSelectDay={setSelectedDay}
          onToday={() => setSelection({ week: today.selectedWeek, day: today.selectedDay })}
          onPreviousWeek={() => setSelectedWeek(Math.max(1, selectedWeek - 1))}
          onNextWeek={() => setSelectedWeek(Math.min(52, selectedWeek + 1))}
          weekLabel={`Week ${selectedWeek} · ${weekMeta.heading}`}
          tasks={tasks}
          sessionTitle={session?.title}
          sessionDescription={session?.description}
          sessionDuration={String(session?.duration ?? "")}
          sessionStress={String(session?.stress ?? "")}
          completed={completed}
          skipped={skippedTasks}
          onSkipTask={(forDate, next) =>
            update((draft) => ({
              ...draft,
              skippedTasks: { ...draft.skippedTasks, [forDate]: next },
              taskCompletionUpdatedAt: {
                ...draft.taskCompletionUpdatedAt,
                [forDate]: new Date().toISOString(),
              },
            }))
          }
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
      {page === "profile" && <BaselineTesting />}

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
