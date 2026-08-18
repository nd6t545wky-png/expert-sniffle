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
import { MetricSource, ReadinessInputs, computeReadiness } from "../src/domain/readiness";
import { HealthPrefillRecord, mergeHistory, readPrefill } from "../src/domain/healthPrefill";
import { DEFAULT_STAT_IDS, MAX_STATS, buildRecap } from "../src/domain/sessionRecap";
import { LoggedSet, loggedTonnage, readDayLog } from "../src/domain/setLog";
import {
  MIN_POINTS_FOR_TREND,
  bodyweightHistory,
  liftProgress,
  taskNamesForDates,
  velocityHistory,
} from "../src/domain/progressTrends";
import { fuelTargetsFromBaseline } from "../src/domain/fuelling";
import { Pitch, readPitches, topVelocity } from "../src/domain/pitchLog";
import { ArmExam, readExams } from "../src/domain/armCare";
import { readCaptures } from "../src/domain/kinematics";
import { Game, readGames } from "../src/domain/gameLog";
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
import { ProgressSpec } from "./components/ProgressTrends";
import { AnnualPlan } from "./components/AnnualPlan";
import { Account } from "./components/Account";
import { BaselineTesting } from "./components/BaselineTesting";
import { ArmCare } from "./components/ArmCare";
import { Card, CardHead } from "./components/Page";
import { addDays, programmeWeekFor } from "../src/domain/calendar";
import {
  BFR_BLOCK,
  INTENT_PERCENT,
  LoggedOuting,
  buildGymRecoveryPlan,
  gymSessionForDay,
  recoveryForDay,
} from "../src/domain/recoveryProtocol";
import { applyRecoveryProtocol } from "../src/domain/recoveryTasks";

import { Integrations } from "./components/Integrations";
import { Mechanics } from "./components/Mechanics";
import { Meal, Nutrition, NutritionTargets } from "./components/Nutrition";

type Page = PageId;

const SYNC_KEY_STORAGE = "dylan-pitching-os-sync-key-v1";
const PAGE_STORAGE = "dylan-pitching-os-page-v1";

/** Quiet period after the last change before autosave uploads. */
const AUTOSAVE_DELAY_MS = 1500;

/** How stale the ring backfill may get before it is swept again. */
const HEALTH_HISTORY_INTERVAL_MS = 12 * 60 * 60 * 1000;

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

/** At most this many lift cards, busiest first. */
const MAX_LIFT_CARDS = 6;

export function App() {
  const { state, load, update, submissions, planFor } = useAppState();
  // Remembering the open page is what stops a reload — or a service-worker
  // update, which reloads without asking — from dropping the athlete back on
  // the dashboard mid-session. sessionStorage, not localStorage: a genuinely
  // new visit should still start at Today.
  const [page, setPage] = useState<Page>(() => {
    try {
      // An OAuth provider sends the athlete back to a URL, not to a stored
      // page. The Oura callback returns with ?page=integrations&oura=…, and
      // before this the app ignored the query entirely and opened on Today —
      // so a connection that had just succeeded looked like nothing happened.
      const requested = new URLSearchParams(window.location.search).get("page");
      if (requested && PAGE_IDS.includes(requested as Page)) return requested as Page;
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

  // Backfill the last 28 days of ring data once a day.
  //
  // Without this the trends only ever hold days the check-in happened to be
  // opened on, which on a rest day is none of them — the chart would be a
  // record of app usage rather than of recovery. Throttled by the stored
  // timestamp so it is one request per day, not one per mount.
  const historyRun = useRef(false);
  useEffect(() => {
    if (!state || historyRun.current || !isValidSyncKey(syncKey)) return;
    const last = Date.parse(String(state.healthHistoryFetchedAt ?? "")) || 0;
    if (Date.now() - last < HEALTH_HISTORY_INTERVAL_MS) return;
    historyRun.current = true;
    api
      .healthHistory(today.openDate, 28, true)
      .then((result) => {
        const fetchedAt = new Date().toISOString();
        update((draft) => ({
          ...draft,
          healthPrefill: mergeHistory(draft.healthPrefill, result.records ?? {}, fetchedAt),
          healthHistoryFetchedAt: fetchedAt,
        }));
      })
      // A failed backfill is not worth interrupting anything over — the charts
      // simply show what they already have, and it retries tomorrow.
      .catch(() => {
        historyRun.current = false;
      });
  }, [state, syncKey, api, today.openDate, update]);

  // The programme's prescriptions depend on training maxes and on Friday's
  // game pitch count, so give it those before building a session.
  useEffect(() => {
    setProgrammeContext({
      pbs: state?.pbs as never,
      post: state?.post as never,
    });
  }, [state]);


  /** Competition outings, newest first. */
  const games = useMemo(() => readGames(state?.games), [state]);

  const knownBodyweight = useMemo(() => {
    const pre = (state?.pre ?? {}) as Record<string, { bodyweightKg?: unknown } | undefined>;
    const weighed = Object.keys(pre)
      .sort()
      .reverse()
      .map((day) => Number(pre[day]?.bodyweightKg))
      .find((value) => Number.isFinite(value) && value > 0);
    const profileWeight = Number((state?.profile as { weight?: unknown } | undefined)?.weight);
    return weighed ?? (Number.isFinite(profileWeight) && profileWeight > 0 ? profileWeight : null);
  }, [state]);

  /**
   * Every throwing session and game the athlete has logged, as outings.
   *
   * The recovery protocol reads this rather than asking anything: the tier and
   * the day come from what was already recorded.
   */
  const loggedOutings = useMemo<LoggedOuting[]>(() => {
    const fromBullpens = throwingEntries.map((entry) => ({
      date: entry.date,
      load: {
        totalThrows: entry.throws ?? null,
        intentPercent: INTENT_PERCENT[entry.intent] ?? null,
      },
    }));
    const fromGames = games.map((game) => ({
      date: game.date,
      load: { gamePitches: game.pitches ?? null, competitiveStart: true },
    }));
    return [...fromBullpens, ...fromGames];
  }, [throwingEntries, games]);

  /** What the open day owes to a recent outing, or nothing. */
  const recovery = useMemo(
    () => recoveryForDay(date, loggedOutings, knownBodyweight),
    [date, loggedOutings, knownBodyweight]
  );

  /**
   * The tasks a given date's session holds, and which of them are resolved.
   *
   * Used to spot a gym session from the plan rather than asking the athlete to
   * classify one they have just finished.
   */
  const tasksOn = useCallback(
    (on: IsoDate) => {
      if (!state) return [];
      try {
        const week = programmeWeekFor(on);
        if (week === null) return [];
        const plan = weekPlan(week, state.pbs);
        for (let day = 0; day < 7; day += 1) {
          if (dateForWeekDay(plan, day) === on) return buildSession(plan, day).tasks;
        }
      } catch {
        return [];
      }
      return [];
    },
    [state]
  );

  const resolvedOn = useCallback(
    (on: IsoDate) => {
      const done = ((state?.completedTasks ?? {}) as Record<string, string[] | undefined>)[on] ?? [];
      const skipped = Object.keys(
        ((state?.skippedTasks ?? {}) as Record<string, Record<string, unknown> | undefined>)[on] ?? {}
      );
      return [...done, ...skipped];
    },
    [state]
  );

  const sessionWithRecovery = useMemo(() => {
    if (!state || !selectedWeekPlan) return { session: null as Session | null, note: null as string | null };
    try {
      // The programme's own session, then the adjustments driven by the
      // athlete's testing reports. Readiness scaling has already been applied
      // by buildSession, so the additions inherit the day's intent.
      const level =
        submission?.planLevel === "reduced" || submission?.planLevel === "recovery"
          ? submission.planLevel
          : null;
      const programmed = applyBaselineProgramming(
        buildSession(selectedWeekPlan, selectedDay, {
          risk: submission?.risk,
          adjustment: submission
            ? { planLevel: submission.planLevel, workloadFactor: submission.workloadFactor }
            : null,
        }),
        level,
        selectedDay
      );
      // The gym track is read from this same plan: which gym stage the day
      // holds, and whether any of it was actually resolved. A prescribed
      // session nobody trained is not something to recover from.
      //
      // Yesterday is checked too, because the gym protocol runs a second day
      // — the flush — and that day's own plan says nothing about it.
      const yesterday = addDays(date, -1);
      const todaysType = gymSessionForDay(programmed.tasks, resolvedOn(date));
      const yesterdaysType = todaysType
        ? null
        : gymSessionForDay(tasksOn(yesterday), resolvedOn(yesterday));
      const gymType = todaysType ?? yesterdaysType;
      const gym = gymType
        ? {
            plan: buildGymRecoveryPlan({
              sessionType: gymType,
              sessionDate: todaysType ? date : yesterday,
              bodyweightKg: knownBodyweight,
            }),
            dayOffset: todaysType ? 0 : 1,
          }
        : null;

      // Recovery last, so it lands on the day as it will actually be trained
      // — including any readiness reduction already applied above.
      const merged = applyRecoveryProtocol(programmed, recovery, { gym });
      return { session: merged.session, note: merged.note };
    } catch {
      return { session: null as Session | null, note: null as string | null };
    }
  }, [state, selectedWeekPlan, selectedDay, submission, recovery, date, knownBodyweight, tasksOn, resolvedOn]);

  const session = sessionWithRecovery.session;
  const recoveryNote = sessionWithRecovery.note;

  // The plan renders stages, cues and detail panels, so it needs the whole
  // task, not a name/prescription pair.
  const tasks = useMemo<PlanTask[]>(() => session?.tasks ?? [], [session]);
  const completed = (state?.completedTasks ?? {}) as Record<IsoDate, string[] | undefined>;
  const skippedTasks = (state?.skippedTasks ?? {}) as Record<
    IsoDate,
    Record<string, SkippedTask> | undefined
  >;
  const weekLoad = totalThrowLoad(throwingEntries.slice(-7));

  // Calories eaten on the day, for the recap card. Read here rather than from
  // the nutrition view below, which is derived later in the render.
  const dayCalories = useMemo(() => {
    const nutritionState = (state?.nutrition ?? {}) as { meals?: Record<string, unknown> };
    const dayMeals = nutritionState.meals?.[date];
    if (!Array.isArray(dayMeals)) return null;
    const total = dayMeals
      .filter((meal): meal is { calories?: unknown; deletedAt?: unknown } => Boolean(meal))
      .filter((meal) => !meal.deletedAt)
      .reduce((sum, meal) => sum + (Number(meal.calories) || 0), 0);
    return total > 0 ? Math.round(total) : null;
  }, [state, date]);

  /** What was actually lifted today, and the tonnage that follows from it. */
  const setLog = useMemo(
    () => readDayLog(state?.setLogs as Record<string, unknown> | undefined, date),
    [state, date]
  );

  /**
   * What today's session says to eat. Bodyweight comes from the most recent
   * check-in that carried one, falling back to the athlete profile.
   */
  const fuel = useMemo(() => {
    const pre = (state?.pre ?? {}) as Record<string, { bodyweightKg?: unknown } | undefined>;
    const weighed = Object.keys(pre)
      .sort()
      .reverse()
      .map((day) => Number(pre[day]?.bodyweightKg))
      .find((value) => Number.isFinite(value) && value > 0);
    const profileWeight = Number((state?.profile as { weight?: unknown } | undefined)?.weight);
    // The scan supplies lean mass and basal rate; bodyweight prefers a fresher
    // reading, because it is the one figure expected to move week to week.
    return fuelTargetsFromBaseline({
      bodyweightKg: weighed ?? (Number.isFinite(profileWeight) ? profileWeight : null),
      stress: session?.stress,
      duration: session?.duration,
      planLevel: plan.status === "unlocked" ? plan.planLevel : plan.status === "held" ? "hold" : null,
      hasSession: Boolean(session),
    });
  }, [state, session, plan]);

  /** Ball flight for the open day, and the fastest pitch on it. */
  const pitches = useMemo(
    () => readPitches(state?.pitches as Record<string, unknown> | undefined, date),
    [state, date]
  );
  const fastest = useMemo(() => topVelocity(pitches), [pitches]);

  /**
   * Every *earlier* day's pitches, for the movement comparison.
   *
   * Today is excluded rather than filtered out downstream: a session compared
   * against a window that contains itself is compared against a blend of
   * itself, and the difference shrinks toward nothing the more was thrown.
   */
  const priorPitches = useMemo(() => {
    const all = (state?.pitches ?? {}) as Record<string, unknown>;
    return Object.keys(all)
      .filter((day) => day !== date)
      .sort()
      .flatMap((day) => readPitches(all, day));
  }, [state, date]);

  const setPitches = useCallback(
    (mutate: (current: Pitch[]) => Pitch[]) =>
      update((draft) => {
        const all = (draft.pitches ?? {}) as Record<string, Pitch[]>;
        const next = mutate(Array.isArray(all[date]) ? all[date] : []);
        return { ...draft, pitches: { ...all, [date]: next } };
      }),
    [update, date]
  );


  /** Hand-digitised delivery measurements. */
  const captures = useMemo(() => readCaptures(state?.kinematics), [state]);

  /** Arm screens, and the bodyweight to open a new one with. */
  const armExams = useMemo(() => readExams(state?.armExams), [state]);


  /**
   * The training trends: has anything moved since this started?
   *
   * Built from the whole log rather than the open day, so the series survive
   * flicking between dates. Lifts are capped — a card per movement in the
   * programme would bury the three the athlete actually cares about under
   * twenty they trained twice.
   */
  const progress = useMemo<ProgressSpec[]>(() => {
    const logs = state?.setLogs as Record<string, unknown> | undefined;
    const names = taskNamesForDates(Object.keys(logs ?? {}));

    const velocity = velocityHistory(
      state?.pitches as Record<string, unknown> | undefined,
      state?.post as Record<string, { bestVelocity?: unknown } | undefined> | undefined
    );
    const weight = bodyweightHistory(state?.pre as Record<string, unknown> | undefined);

    const specs: ProgressSpec[] = [];

    if (velocity.length >= MIN_POINTS_FOR_TREND) {
      specs.push({
        key: "velocity",
        title: "Top throwing speed",
        explain:
          "The fastest pitch measured each day, from your pitch log or the figure you entered at check-out.",
        points: velocity,
        higherIsBetter: true,
        unit: " mph",
        precision: 1,
      });
    }

    for (const lift of liftProgress(logs, names).slice(0, MAX_LIFT_CARDS)) {
      specs.push({
        key: `lift-${lift.name}`,
        title: lift.name,
        // Short on purpose. The card above spells out what an estimated one-rep
        // max is; repeating the full sentence on every lift pushed the number
        // itself below the fold on a phone.
        explain: "Estimated one-rep max from your heaviest set that day.",
        points: lift.points,
        higherIsBetter: true,
        unit: " kg",
        precision: 1,
      });
    }

    if (weight.length >= MIN_POINTS_FOR_TREND) {
      specs.push({
        key: "bodyweight",
        title: "Bodyweight",
        // No direction: gaining and losing are both goals depending on the
        // block, so the card reports the movement and does not grade it.
        explain: "What you weighed at check-in.",
        points: weight,
        higherIsBetter: null,
        unit: " kg",
        precision: 1,
      });
    }

    return specs;
  }, [state]);

  const recapStats = useMemo(
    () => (Array.isArray(state?.recapStats) ? (state.recapStats as string[]) : [...DEFAULT_STAT_IDS]),
    [state]
  );

  // What the day actually was, for the shareable recap card. Built from the
  // logged record only — a card is a public claim about training, so anything
  // not logged is omitted rather than defaulted to zero.
  const recap = useMemo(
    () =>
      buildRecap({
        date,
        session,
        tasks,
        completed: completed[date] ?? [],
        skipped: skippedTasks[date] ?? {},
        // The measured pitch log outranks the number typed at check-out — it is
        // the device's reading rather than a recollection. It supplies the
        // speed only: which personal best a bullpen fastball counts toward is
        // the athlete's call at check-out, and guessing "pulldown" here would
        // award a pulldown PB for a pitch that was never one.
        report: fastest
          ? { ...(reports[date] ?? {}), bestVelocity: fastest.mph }
          : (reports[date] ?? null),
        submission: submission ?? null,
        throwing: (state?.bullpens as Record<string, ThrowingEntry | undefined>)?.[date] ?? null,
        calories: dayCalories,
        tonnageKg: loggedTonnage(setLog),
        pbs: state?.pbs,
        chosen: recapStats,
      }),
    [date, session, tasks, completed, skippedTasks, reports, submission, state, dayCalories, recapStats, setLog, fastest]
  );
  const recapCaption = String(
    (state?.recapCaptions as Record<string, unknown> | undefined)?.[date] ?? ""
  );

  /** Toggle a stat on the card, keeping the chosen order and the six-stat cap. */
  const toggleRecapStat = useCallback(
    (id: string) =>
      update((draft) => {
        const current = Array.isArray(draft.recapStats)
          ? (draft.recapStats as string[])
          : [...DEFAULT_STAT_IDS];
        const next = current.includes(id)
          ? current.filter((item) => item !== id)
          : [...current, id].slice(0, MAX_STATS);
        return { ...draft, recapStats: next };
      }),
    [update]
  );

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

  function handleReadinessSubmitted(
    result: ReturnType<typeof computeReadiness>,
    forDate: IsoDate,
    detail: {
      inputs: ReadinessInputs;
      sources: { hrvSource?: MetricSource; restingHeartRateSource?: MetricSource; sleepSource?: MetricSource };
      bodyweightKg: number | null;
    }
  ) {
    update((draft) => {
      // The answers and their provenance are stored alongside the score. The
      // rolling HRV and resting-heart-rate baselines are medians over prior
      // check-ins, so a record that keeps only its score contributes nothing
      // and the signals gated on those baselines stay permanently dormant.
      const next: ReadinessSubmission = {
        date: forDate,
        score: result.score,
        risk: result.risk,
        planLevel: result.planLevel,
        workloadFactor: result.workloadFactor,
        submittedAt: new Date().toISOString(),
        inputs: detail.inputs,
        ...detail.sources,
        ...(detail.bodyweightKg !== null ? { bodyweightKg: detail.bodyweightKg } : {}),
      };
      return { ...draft, pre: { ...draft.pre, [forDate]: next } };
    });
    setPage("session");
  }

  function handleHealthPrefill(forDate: IsoDate, record: HealthPrefillRecord) {
    update((draft) => ({
      ...draft,
      healthPrefill: { ...draft.healthPrefill, [forDate]: record },
    }));
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
          health={readPrefill(state.healthPrefill, date)}
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
          recoveryNote={recoveryNote}
          setLog={setLog}
          onLogSets={(task, sets) =>
            update((draft) => {
              const logs = (draft.setLogs ?? {}) as Record<string, Record<string, LoggedSet[]>>;
              const day = { ...(logs[date] ?? {}) };
              // Saving an empty list clears the entry rather than storing an
              // empty array that would read as "logged, but nothing".
              if (sets.length) day[task.id] = sets;
              else delete day[task.id];
              return { ...draft, setLogs: { ...logs, [date]: day } };
            })
          }
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
        <HealthForm
          date={date}
          plan={plan}
          existing={state.pre}
          onSubmitted={handleReadinessSubmitted}
          api={api}
          prefill={state.healthPrefill}
          onPrefill={handleHealthPrefill}
          hasSyncKey={isValidSyncKey(syncKey)}
        />
      )}

      {page === "workload" && (
        <Workload
          date={date}
          plan={plan}
          entries={throwingEntries}
          onLog={(entry) =>
            update((draft) => ({ ...draft, bullpens: { ...draft.bullpens, [entry.date]: entry } }))
          }
          pitches={pitches}
          priorPitches={priorPitches}
          games={games}
          onSaveGame={(game: Game) =>
            update((draft) => ({ ...draft, games: [...readGames(draft.games), game] }))
          }
          onRemoveGame={(id: string) =>
            update((draft) => ({
              ...draft,
              games: readGames(draft.games).filter((game) => game.id !== id),
            }))
          }
          onImportPitches={(imported) => setPitches((current) => [...current, ...imported])}
          onAddPitch={(pitch) => setPitches((current) => [...current, pitch])}
          onRemovePitch={(id) => setPitches((current) => current.filter((p) => p.id !== id))}
        />
      )}

      {page === "tracking" && (
        <Tracking
          date={date}
          plan={plan}
          reports={reports}
          onReport={(report) => update((draft) => ({ ...draft, post: { ...draft.post, [report.date]: report } }))}
          healthPrefill={state.healthPrefill}
          submissions={state.pre}
          recap={recap}
          api={api}
          hasSyncKey={isValidSyncKey(syncKey)}
          recapCaption={recapCaption}
          recapStats={recapStats}
          onToggleRecapStat={toggleRecapStat}
          progress={progress}
          onRecapCaption={(caption) =>
            update((draft) => ({
              ...draft,
              recapCaptions: { ...(draft.recapCaptions as Record<string, string>), [date]: caption },
            }))
          }
        />
      )}

      {page === "annual" && (
        <AnnualPlan selectedWeek={selectedWeek} onSelectWeek={setSelectedWeek} today={today.openDate} />
      )}

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
          fuel={fuel}
          onAdoptFuel={(targets) =>
            updateNutrition((current) => ({
              ...current,
              targets: {
                calories: targets.calories,
                protein: targets.protein,
                carbs: targets.carbs,
                fat: targets.fat,
                fluid: targets.fluid,
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

      {page === "mechanics" && (
        <Mechanics
          api={api}
          date={date}
          hasSyncKey={isValidSyncKey(syncKey)}
          captures={captures}
          throws={
            (state.profile as { throwingHand?: string } | undefined)?.throwingHand === "Left"
              ? "left"
              : "right"
          }
          onSaveCapture={(capture) =>
            update((draft) => ({
              ...draft,
              kinematics: [...readCaptures(draft.kinematics), capture],
            }))
          }
          onRemoveCapture={(id) =>
            update((draft) => ({
              ...draft,
              kinematics: readCaptures(draft.kinematics).filter((capture) => capture.id !== id),
            }))
          }
        />
      )}

      {page === "integrations" && <Integrations api={api} hasSyncKey={isValidSyncKey(syncKey)} />}

      {/* The sections the five-item bottom nav cannot hold are reached through
          the shell's "More" sheet, as in the prototype — not through a nav list
          rendered into the page body. */}
      {page === "profile" && <BaselineTesting />}

      {/* The BFR cuff block, beside the arm screen because that is where arm
          strength work lives. Reference rather than a daily task: it is a
          twice-weekly programme, and it depends on equipment the athlete may
          not have — which the guardrail says plainly. */}
      {page === "profile" && (
        <Card>
          <CardHead title={BFR_BLOCK.name} detail="Twice a week, throwing arm only." />
          <p className="recovery-prescription">{BFR_BLOCK.prescription}</p>
          <p className="recovery-caveat">{BFR_BLOCK.guardrail}</p>
          <details className="recovery-why">
            <summary>Why</summary>
            <p>{BFR_BLOCK.why}</p>
            <p className="recovery-citation">
              <strong>{BFR_BLOCK.citation.key}</strong> — {BFR_BLOCK.citation.detail}
            </p>
            <p>{BFR_BLOCK.experimentalNote}</p>
          </details>
        </Card>
      )}

      {page === "profile" && (
        <ArmCare
          date={date}
          exams={armExams}
          bodyweightKg={knownBodyweight}
          onSave={(armExam) =>
            update((draft) => ({
              ...draft,
              armExams: [...readExams(draft.armExams), armExam],
            }))
          }
          onRemove={(id) =>
            update((draft) => ({
              ...draft,
              armExams: readExams(draft.armExams).filter((item) => item.id !== id),
            }))
          }
        />
      )}

      {page === "profile" && (
        <Account
          api={api}
          syncKey={syncKey}
          onSyncKey={setSyncKey}
          onSyncNow={handleSyncNow}
          syncStatus={syncStatus}
          state={state}
          onReplaceState={(next) => update(() => next)}
        />
      )}
    </Shell>
  );
}

export type { Page, ThrowIntent };
