import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, IsoDate } from "../src/domain/state";
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
import { LoggedSet, isLoggable, loggedTonnage, readDayLog, setUnit } from "../src/domain/setLog";
import { ThrowingRecord, adoptTally, tallyThrows } from "../src/domain/throwCount";
import { Advice, liftHistory, progressionFor } from "../src/domain/progression";
import {
  MIN_POINTS_FOR_TREND,
  bodyweightHistory,
  liftProgress,
  taskIndexForDates,
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
  WeekPlan,
  buildSession,
  currentSelection,
  dateForWeekDay,
  GameRole,
  readGameRole,
  sessionHasGame,
  setProgrammeContext,
  weekPlan,
} from "../src/domain/programmeSessions";
import { applyBaselineProgramming } from "../src/domain/programmeUpdates";
import { seedBaselinePbs } from "../src/domain/baseline";
import { readTrainingMaxes, setTrainingMax } from "../src/domain/trainingMaxes";
import { TrainingMaxes } from "./components/TrainingMaxes";
import { useAppState } from "./state/useAppState";
import { useAppearance } from "./state/useAppearance";
import { PageId, Shell } from "./components/Shell";
import { DailyPlan, PlanTask } from "./components/DailyPlan";
import { DayTab, dayStatus } from "./components/DayTabs";
import { HealthForm } from "./components/HealthForm";
import { GameRoleCard } from "./components/GameRole";
import { Workload, ThrowingEntry } from "./components/Workload";
import { Tracking } from "./components/Tracking";
import { ProgressSpec } from "./components/ProgressTrends";
import { AnnualPlan } from "./components/AnnualPlan";
import { Account, INVITE_STORAGE } from "./components/Account";
import { BaselineTesting } from "./components/BaselineTesting";
import { ArmCare } from "./components/ArmCare";
import { Card, CardHead, PageHead, Segments } from "./components/Page";
import { ThrowCountCard } from "./components/ThrowCountCard";
import { GameLog } from "./components/GameLog";
import { BallclubzCard } from "./components/BallclubzCard";
import { ProfileCard, ProfileSetup } from "./components/ProfileSetup";
import { Hitting } from "./components/Hitting";
import { asPositionPlayer } from "../src/domain/positionPlayer";
import { readSchedule } from "../src/domain/weeklySchedule";
import { HittingGame, readHittingGames } from "../src/domain/hitting";
import { BattingLine } from "../src/domain/ballclubz";
import { leagueTeam } from "../src/domain/leagues";
import { AthleteProfile, hits as roleHits, pitches as rolePitches, profileComplete, readAthleteProfile, winterClubOf } from "../src/domain/athleteProfile";
import { mergeBallclubzOutings } from "../src/domain/ballclubz";
import { VelocityBlock } from "./components/VelocityBlock";
import { weekFromTasks } from "../src/domain/velocity";
import { formatIsoDate } from "./state/formatDate";
import { addDays, programmeWeekFor } from "../src/domain/calendar";
import {
  BFR_BLOCK,
  LoggedOuting,
  acwrReading,
  buildGymRecoveryPlan,
  gymSessionForDay,
  readEquipment,
  readIntentPercent,
  recoveryForDay,
  restProblems,
} from "../src/domain/recoveryProtocol";
import { RecoverySettings } from "./components/RecoverySettings";
import { FixtureSettings } from "./components/FixtureSettings";
import { RetestSheet } from "./components/RetestSheet";
import { TransferCard } from "./components/TransferCard";
import { applyRecoveryProtocol } from "../src/domain/recoveryTasks";
import { applyTeamTraining, readTeamTraining } from "../src/domain/teamTraining";
import { allFixtures, builtInFixturesFor, fixtureOn, fixturesBetween, readAthleteFixtures, scheduleClash } from "../src/domain/fixtures";
import { readRetests } from "../src/domain/retest";
import { velocityTransfer } from "../src/domain/velocityTransfer";
import { Bloods } from "./components/Bloods";
import { drawContext, readPanels } from "../src/domain/bloods";
import { PhysioSummary, SHARE_DAYS, buildPhysioSummary } from "../src/domain/physioShare";
import {
  BodyRegion,
  QUALITY_LABELS,
  REGION_LABELS,
  SorenessReport,
  TIMING_LABELS,
  TREND_LABELS,
  activeReports,
  readReports,
  triageReport,
} from "../src/domain/soreness";
import { SorenessChange, applySorenessProtocol } from "../src/domain/sorenessTasks";
import { SorenessCard } from "./components/SorenessCard";
import { PhysioShare, publishShare, readStoredShare } from "./components/PhysioShare";

import { Integrations } from "./components/Integrations";
import { TrainingHistoryCard } from "./components/TrainingHistoryCard";
import { pullRemoteHistory, pushPendingHistory } from "../src/domain/historySync";
import { mergeTrainingHistories, pendingHistoryEvents } from "../src/domain/trainingHistory";
import { Mechanics } from "./components/Mechanics";
import { Meal, Nutrition, NutritionTargets } from "./components/Nutrition";

type Page = PageId;

const SYNC_KEY_STORAGE = "dylan-pitching-os-sync-key-v1";
/** Which account the local copy on this device belongs to. */
const ACCOUNT_OWNER_STORAGE = "dylan-pitching-os-account-v1";
const PAGE_STORAGE = "dylan-pitching-os-page-v1";

/** Quiet period after the last change before autosave uploads. */
const AUTOSAVE_DELAY_MS = 1500;
const HISTORY_RETRY_MS = 60_000;

/**
 * What the snapshot autosave compares. The training history is uploaded on
 * its own route and excluded from the snapshot, so marking an event uploaded
 * must not look like a change worth re-sending the snapshot for.
 */
function snapshotFingerprint(state: AppState): string {
  const { trainingHistory: _history, ...rest } = state;
  return JSON.stringify(rest);
}

/** How often a live physio link re-publishes itself, at most. */
const SHARE_REFRESH_MS = 15 * 60 * 1000;

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
  session: "Today",
  readiness: "Today",
  workload: "Throwing",
  tracking: "Progress",
  annual: "Season",
  nutrition: "Food",
  mechanics: "Biomechanics",
  bloods: "Bloods",
  integrations: "Connections",
  profile: "Settings",
  account: "Account & backup",
  hitting: "Hitting",
};

const THROWING_TABS = [
  { value: "today", label: "Today" },
  { value: "pitches", label: "Pitches" },
  { value: "games", label: "Games" },
  { value: "mechanics", label: "Mechanics" },
] as const;
type ThrowingTab = (typeof THROWING_TABS)[number]["value"];

const PROGRESS_TABS = [
  { value: "trends", label: "Trends" },
  { value: "testing", label: "Testing & maxes" },
  { value: "bloods", label: "Bloods" },
] as const;
type ProgressTab = (typeof PROGRESS_TABS)[number]["value"];

const PAGE_IDS: Page[] = [
  "dashboard",
  "session",
  "readiness",
  "workload",
  "tracking",
  "annual",
  "nutrition",
  "mechanics",
  "bloods",
  "integrations",
  "profile",
  "account",
];

/** A club's colours and badge, where the app has them; the plain palette otherwise. */
function teamBranding(name: string): { name: string; logo: string; alt: string; theme: string } {
  if (name === "Coomera Cubs") {
    // `theme-coomera`, not `theme-cubs`: the stylesheet has only ever defined
    // the former, and a class nothing matches leaves every team colour unset.
    return { name, logo: "/assets/coomera-cubs-logo.png", alt: "Coomera Cubs Baseball Club logo", theme: "theme-coomera" };
  }
  if (name === "Norths") {
    return { name, logo: "/assets/norths-baseball-logo.jpg", alt: "Norths Baseball Club logo", theme: "theme-norths" };
  }
  return { name, logo: "", alt: "", theme: "" };
}

/** Dylan's GBL D1 2026-27 player page; changeable in Settings. */
const DEFAULT_BALLCLUBZ_URL = "https://ballclubz.com/gbld1/teams/9971819/687154";

const DEFAULT_TARGETS: NutritionTargets = { calories: 0, protein: 0, carbs: 0, fat: 0, fluid: 0 };

/** At most this many lift cards, busiest first. */
const MAX_LIFT_CARDS = 6;

export function App() {
  const { state, load, update, submissions, planFor, reset } = useAppState();
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
      const params = new URLSearchParams(window.location.search);
      // An invite link: keep the code for after sign-in, and open the page
      // where signing in happens.
      const invite = params.get("invite");
      if (invite) {
        window.localStorage.setItem(INVITE_STORAGE, invite);
        return "account";
      }
      const requested = params.get("page");
      if (requested && PAGE_IDS.includes(requested as Page)) return requested as Page;
      const stored = window.sessionStorage.getItem(PAGE_STORAGE);
      return stored && PAGE_IDS.includes(stored as Page) ? (stored as Page) : "session";
    } catch {
      return "session";
    }
  });
  // The old summary page and the separate check-in page are both part of
  // Today now. A stored or linked id for either still lands somewhere real.
  const view: Page = page === "dashboard" || page === "readiness" ? "session" : page;
  const [throwingTab, setThrowingTab] = useState<ThrowingTab>("today");
  const [progressTab, setProgressTab] = useState<ProgressTab>("trends");

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
  const gameRole = readGameRole(submission?.gameRole);

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
    // A logged game is the day's game pitches too — whether it was typed in
    // or came from Ballclubz — so the day after a start is built as recovery
    // without the count being entered twice. A check-out figure still wins.
    const post = { ...((state?.post ?? {}) as Record<string, { gamePitches?: number } | undefined>) };
    for (const game of readGames(state?.games)) {
      const pitches = Number(game.pitches);
      if (!Number.isFinite(pitches) || pitches <= 0) continue;
      const day = post[game.date];
      if (!day?.gamePitches) post[game.date] = { ...(day ?? {}), gamePitches: pitches };
    }
    setProgrammeContext({
      pbs: state?.pbs as never,
      post: post as never,
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
   * What this athlete owns, and what their intent words mean.
   *
   * Both were constants until the athlete's kit and the athlete's reading of
   * "moderate" turned out to be things that change. Absent from the workspace
   * means "never set", which keeps the defaults.
   */
  const recoveryEquipment = useMemo(
    () => readEquipment((state?.profile as { recoveryEquipment?: unknown } | undefined)?.recoveryEquipment),
    [state]
  );
  const intentPercent = useMemo(
    () => readIntentPercent((state?.profile as { intentPercent?: unknown } | undefined)?.intentPercent),
    [state]
  );
  /**
   * Which nights the athlete is at club training.
   *
   * Saved rather than hardcoded: club schedules move, and the plan has to
   * follow without a deploy. The default is what is true now — Coomera Cubs on
   * Tuesdays, from the week it started.
   */
  const teamTraining = useMemo(
    () => readTeamTraining((state?.profile as { teamTraining?: unknown } | undefined)?.teamTraining),
    [state]
  );
  /** The athlete's own week from the sign-up questions; null until answered. */
  const schedule = useMemo(() => readSchedule(state?.profile), [state]);
  /**
   * The season, as far as anyone can actually confirm it.
   *
   * The built-in draw stops at Round 19 and neither league publishes anything
   * this app can read, so anything past that — a finals series especially —
   * has to come from the athlete.
   */
  const athleteFixtures = useMemo(
    () => readAthleteFixtures((state?.profile as { fixtures?: unknown } | undefined)?.fixtures),
    [state]
  );
  // The draw for this athlete's own teams — see `builtInFixturesFor`.
  const builtInFixtures = useMemo(() => {
    const profile = state?.profile as { teamDraw?: { team?: string; games?: unknown } } | undefined;
    const team = readAthleteProfile(state?.profile).team ?? "Coomera Cubs";
    const draw = profile?.teamDraw?.team === team && Array.isArray(profile.teamDraw.games) ? profile.teamDraw.games : [];
    return builtInFixturesFor(team, winterClubOf(state?.profile), draw as never);
  }, [state?.profile]);
  const fixtures = useMemo(() => allFixtures(athleteFixtures, builtInFixtures), [athleteFixtures, builtInFixtures]);

  /**
   * Whether a game is on, on a given date.
   *
   * Threaded into every `buildSession` call rather than read inside it: the
   * fixture list is the athlete's data and the programme is a pure function of
   * week and day, and keeping it that way is what makes the sessions testable
   * without a store behind them.
   */
  const gameOn = useCallback(
    (on: IsoDate) => fixtureOn(on, fixtures) !== null,
    [fixtures]
  );

  /**
   * Fixtures in the week a session belongs to.
   *
   * The day-level flag decides whether that day is a game day; this decides
   * what the *week* is for. A week the block table planned as a post-season
   * unload but which actually holds a final is a competition week, and the
   * intensity policy has to know before it caps the plyo ladder at the
   * recovery band on the Wednesday before it.
   */
  const gamesInWeekOf = useCallback(
    (plan: WeekPlan | null) =>
      plan ? fixturesBetween(dateForWeekDay(plan, 0), dateForWeekDay(plan, 6), fixtures).length : 0,
    [fixtures]
  );

  /**
   * The athlete's week for a given programme week.
   *
   * A team in a league the app follows (other than the Cubs, whose draw the
   * programme was written around) has its real games for that week read off
   * the imported draw: a Wednesday round, a four-game ABL series, or a bye.
   * Anyone else keeps the usual days they gave at sign-up.
   */
  const followsDraw = useMemo(() => {
    const team = readAthleteProfile(state?.profile).team;
    const draw = (state?.profile as { teamDraw?: { team?: string; games?: unknown[] } } | undefined)?.teamDraw;
    return Boolean(
      team && team !== "Coomera Cubs" && leagueTeam(team) && draw?.team === team && Array.isArray(draw.games) && draw.games.length
    );
  }, [state?.profile]);
  /** Whether the athlete's league has any game over the programme's Christmas break. */
  const playsThroughChristmas = useMemo(() => {
    for (let week = 1; week <= 60; week += 1) {
      let plan: WeekPlan;
      try {
        plan = weekPlan(week);
      } catch {
        break;
      }
      if (plan.phase.id !== "summer_break") continue;
      if (fixturesBetween(dateForWeekDay(plan, 0), dateForWeekDay(plan, 6), fixtures).length) return true;
    }
    return false;
  }, [fixtures]);
  const scheduleForWeek = useCallback(
    (plan: WeekPlan | null) => {
      if (!schedule || !plan || !followsDraw) return schedule;
      const games = [0, 1, 2, 3, 4, 5, 6].filter((day) => fixtureOn(dateForWeekDay(plan, day), fixtures) !== null);
      return { ...schedule, games, fromDraw: true, inSeason: playsThroughChristmas };
    },
    [schedule, followsDraw, fixtures, playsThroughChristmas]
  );

  /**
   * Whether the selected day is a game day, before any answer reshapes it —
   * the programme's own game days and any fixture the athlete entered. Game
   * days ask "are you playing?" at the check-in.
   */
  const isGameDay = useMemo(() => {
    if (!selectedWeekPlan) return false;
    try {
      return sessionHasGame(
        buildSession(selectedWeekPlan, selectedDay, {
          game: gameOn(date),
          gameTomorrow: gameOn(addDays(date, 1)),
          schedule: scheduleForWeek(selectedWeekPlan),
        })
      );
    } catch {
      return false;
    }
  }, [selectedWeekPlan, selectedDay, date, gameOn, scheduleForWeek]);
  const retests = useMemo(
    () => readRetests((state?.profile as { retests?: unknown } | undefined)?.retests),
    [state]
  );
  /**
   * Best mound reading against best pulldown — the constraint profile's key
   * missing diagnostic, read off check-outs the app has always been recording.
   */
  const transfer = useMemo(
    () => velocityTransfer(state?.post as Record<string, { bestVelocity?: unknown; velocityType?: unknown }> | undefined),
    [state]
  );

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
        intentPercent: intentPercent[entry.intent] ?? null,
      },
    }));
    const fromGames = games.map((game) => ({
      date: game.date,
      load: { gamePitches: game.pitches ?? null, competitiveStart: true },
    }));
    return [...fromBullpens, ...fromGames];
  }, [throwingEntries, games, intentPercent]);

  /** Blood panels the athlete has entered from their own pathology reports. */
  const bloodPanels = useMemo(
    () => readPanels((state?.profile as { bloodPanels?: unknown } | undefined)?.bloodPanels),
    [state]
  );

  /**
   * The training fortnight a draw sat in.
   *
   * This is the only thing the blood page does that a pathology portal cannot:
   * a CK drawn thirty-six hours after a start is not the same reading as the
   * same number on a rest day, and the laboratory has no way of knowing which
   * it was. Everything here is already recorded — outings, check-in sleep,
   * logged sets — so the panel costs nothing extra to put in context.
   */
  /**
   * What the programme says about every task the athlete has ever logged
   * against: the lift's name, and whether its sets are reps or metres.
   *
   * Shared by everything below that reads logged sets without the session that
   * produced them, because getting it means walking fifty-two weeks of the
   * programme forward — once here, rather than once per consumer.
   */
  const loggedTasks = useMemo(
    () => taskIndexForDates(Object.keys((state?.setLogs as Record<string, unknown> | undefined) ?? {})),
    [state?.setLogs]
  );

  const bloodContext = useCallback(
    (drawnOn: IsoDate) => {
      const pre = (state?.pre ?? {}) as Record<string, { sleepHours?: unknown } | undefined>;
      const sleepByDate: Record<string, number | undefined> = {};
      for (const [day, entry] of Object.entries(pre)) {
        const hours = Number(entry?.sleepHours);
        if (Number.isFinite(hours) && hours > 0) sleepByDate[day] = hours;
      }

      const logs = (state?.setLogs ?? {}) as Record<string, unknown>;
      const tonnageByDate: Record<string, number | undefined> = {};
      for (const day of Object.keys(logs)) {
        // Units, so a farmer carry's metres do not arrive here as kilograms.
        tonnageByDate[day] = loggedTonnage(readDayLog(logs, day as IsoDate), loggedTasks.units);
      }

      return drawContext(drawnOn, {
        outings: loggedOutings.map((outing) => ({ date: outing.date, ...outing.load })),
        sleepByDate,
        tonnageByDate,
      });
    },
    [state?.pre, state?.setLogs, loggedOutings, loggedTasks]
  );

  /**
   * What the athlete has reported as sore, and what today does about it.
   *
   * Reports carry forward from the day they were made — pain does not stop
   * existing because nobody opened the app — so this is read for the open date
   * rather than only for today.
   */
  const sorenessReports = useMemo(() => readReports(state?.soreness), [state]);
  const soreness = useMemo(() => activeReports(sorenessReports, date), [sorenessReports, date]);

  /** What the open day owes to a recent outing, or nothing. */
  const recovery = useMemo(
    () => recoveryForDay(date, loggedOutings, knownBodyweight, recoveryEquipment),
    [date, loggedOutings, knownBodyweight, recoveryEquipment]
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
          if (dateForWeekDay(plan, day) === on) {
            return buildSession(plan, day, {
              game: gameOn(on),
              gameTomorrow: gameOn(addDays(on, 1)),
              weekGames: gamesInWeekOf(plan),
              role: readGameRole(submissions[on]?.gameRole),
              schedule: scheduleForWeek(plan),
            }).tasks;
          }
        }
      } catch {
        return [];
      }
      return [];
    },
    [state, gameOn, gamesInWeekOf, submissions, scheduleForWeek]
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

  // Pitcher, two-way or position player, from the sign-up answers. Read here
  // because the day's session depends on it.
  const playerRole = readAthleteProfile(state?.profile).playerType ?? "pitcher";

  const sessionWithRecovery = useMemo(() => {
    if (!state || !selectedWeekPlan)
      return {
        session: null as Session | null,
        note: null as string | null,
        teamNote: null as string | null,
      };
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
          // A fixture the athlete entered outranks the calendar's guess about
          // which days hold a game, about which day is the one before a game,
          // and about whether the week is competition or an off-season unload.
          game: gameOn(date),
          gameTomorrow: gameOn(addDays(date, 1)),
          weekGames: gamesInWeekOf(selectedWeekPlan),
          role: gameRole,
          schedule: scheduleForWeek(selectedWeekPlan),
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
              equipment: recoveryEquipment,
            }),
            dayOffset: todaysType ? 0 : 1,
          }
        : null;

      // Club training goes in before recovery and soreness, so both of those
      // see the day as it will actually be trained. A Tuesday that now carries
      // Cubs practice is not the Tuesday the programme costed.
      const team = applyTeamTraining(programmed, {
        day: selectedDay,
        date,
        settings: teamTraining,
      });

      // Recovery next, so it lands on the day as it will actually be trained
      // — including any readiness reduction already applied above.
      const merged = applyRecoveryProtocol(team.session, recovery, {
        gym,
        resolvedTaskIds: resolvedOn(date),
      });

      // Soreness last of all, and deliberately so: it is the only overlay that
      // removes work, and it has to be able to remove work the other two added.
      // A protocol that puts loaded cuff work back on day 3 must not override a
      // shoulder that has been on hold since day 1.
      const managed = applySorenessProtocol(merged.session, soreness);
      return {
        // A position player gets the same day without the pitcher's throwing.
        session: playerRole === "position" ? asPositionPlayer(managed.session) : managed.session,
        note: merged.note,
        teamNote: team.note,
        sorenessNote: managed.note,
        changes: managed.changes,
        referral: managed.referral,
      };
    } catch {
      return {
        session: null as Session | null,
        note: null as string | null,
        teamNote: null as string | null,
        sorenessNote: null as string | null,
        changes: [] as SorenessChange[],
        referral: null as string | null,
      };
    }
  }, [
    state,
    selectedWeekPlan,
    selectedDay,
    submission,
    recovery,
    date,
    knownBodyweight,
    recoveryEquipment,
    teamTraining,
    soreness,
    tasksOn,
    resolvedOn,
    gameOn,
    gamesInWeekOf,
    playerRole,
    scheduleForWeek,
  ]);

  const session = sessionWithRecovery.session;
  // Two separate sentences rather than one joined: the recovery note says what
  // the day is recovering from, the soreness note says what was changed about
  // it, and running them together reads as one explanation for both.
  /**
   * A game in a week the programme planned as having none.
   *
   * The day itself is acted on — `buildSession` gets `game` and builds a game
   * day. This is about the days around it, which the fixed phase table still
   * owns: rebuilding the back half of the year because one date was entered is
   * not a call to make on the athlete's behalf.
   */
  const clash = useMemo(() => {
    if (!selectedWeekPlan) return null;
    return scheduleClash(
      {
        start: dateForWeekDay(selectedWeekPlan, 0),
        end: dateForWeekDay(selectedWeekPlan, 6),
        phaseId: String(selectedWeekPlan.phase.id),
        phaseName: String(selectedWeekPlan.phase.name),
      },
      fixtures
    );
  }, [selectedWeekPlan, fixtures]);

  // The club note leads: it explains why the day looks different from the
  // programme, and the other two explain what was then done to it.
  const recoveryNote =
    [sessionWithRecovery.teamNote, sessionWithRecovery.note, sessionWithRecovery.sorenessNote]
      .filter(Boolean)
      .join(" ") || null;

  // The plan renders stages, cues and detail panels, so it needs the whole
  // task, not a name/prescription pair.
  const tasks = useMemo<PlanTask[]>(() => session?.tasks ?? [], [session]);
  const completed = (state?.completedTasks ?? {}) as Record<IsoDate, string[] | undefined>;
  const skippedTasks = (state?.skippedTasks ?? {}) as Record<
    IsoDate,
    Record<string, SkippedTask> | undefined
  >;
  const weekLoad = totalThrowLoad(throwingEntries.slice(-7));

  /**
   * The day's throwing, added up from what has actually been ticked.
   *
   * Games are folded in here too: an appearance's prescription is "team pitch
   * limits apply", which is the honest thing for it to say and no use as a
   * number, so the count comes from the game log once the game is entered.
   */
  const throwTally = useMemo(
    () => tallyThrows(tasks, completed[date] ?? [], games.filter((game) => game.date === date), intentPercent),
    [tasks, completed, date, games, intentPercent]
  );

  const throwEntry = useMemo(
    () => ((state?.bullpens ?? {}) as Record<string, ThrowingRecord | undefined>)[date] ?? null,
    [state?.bullpens, date]
  );

  /**
   * Keep the stored throwing entry in step with the ticks.
   *
   * Run from the completion handler rather than from an effect: an effect that
   * writes state on every render of a page that reads that state is a loop
   * waiting for one wrong dependency, and this only ever needs to happen when
   * a task is ticked or unticked. `adoptTally` decides whether the write is
   * ours to make — a count the athlete typed is never overwritten.
   */
  const reconcileThrows = useCallback(
    (draft: AppState, forDate: IsoDate, nextCompleted: string[]): AppState => {
      const bullpens = { ...((draft.bullpens ?? {}) as Record<string, ThrowingRecord | undefined>) };
      const tally = tallyThrows(
        tasks,
        nextCompleted,
        games.filter((game) => game.date === forDate),
        intentPercent
      );
      const outcome = adoptTally(bullpens[forDate], tally, forDate);
      if (outcome.action === "keep") return draft;
      if (outcome.action === "clear") delete bullpens[forDate];
      else bullpens[forDate] = outcome.entry;
      return { ...draft, bullpens: bullpens as AppState["bullpens"] };
    },
    [tasks, games, intentPercent]
  );

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

  /**
   * Active energy the ring reported for the open day.
   *
   * Read from the stored health payload rather than fetched: the field has
   * been imported and persisted since Apple Health was connected, and until
   * now nothing displayed it anywhere, which reads as data going missing.
   * Shown on the fuelling card as context, never added to the target — the
   * card says why.
   */
  const activeCaloriesToday = useMemo(() => {
    const merged = readPrefill(state?.healthPrefill as Record<string, unknown> | undefined, date).merged;
    const value = Number(merged?.activeCalories);
    return Number.isFinite(value) && value > 0 ? value : null;
  }, [state, date]);

  /** What was actually lifted today, and the tonnage that follows from it. */
  /**
   * What each of today's lifts was loaded with last time, and whether to move.
   *
   * Built here rather than in the plan because it needs the whole set-log
   * history, and because resolving a historical task id to a lift's name means
   * rebuilding the sessions those logs belong to — `taskNamesForDates` walks
   * the programme forward to do it. Keyed by *today's* task id so the plan can
   * look each one up without knowing any of that.
   *
   * Recomputed only when the logs, the day or the session change; the walk is
   * over fifty-two weeks and does not belong in a render.
   */
  const progression = useMemo(() => {
    const logs = state?.setLogs as Record<string, unknown> | undefined;
    const out: Record<string, Advice> = {};
    for (const task of tasks) {
      if (!isLoggable(task)) continue;
      const advice = progressionFor(task, liftHistory(logs, loggedTasks.names, task.name, date), date);
      if (advice) out[task.id] = advice;
    }
    return out;
  }, [state?.setLogs, loggedTasks, tasks, date]);

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
   * The summary a physio is sent, built fresh whenever a link is made or
   * refreshed.
   *
   * Deliberately a function rather than a memo: it is only ever needed at the
   * moment of publishing, and building it on every render would walk four weeks
   * of history for a card that is usually closed.
   */
  const buildPhysioSummaryNow = useCallback((options: { bloods: boolean }): PhysioSummary => {
    const profile = (state?.profile ?? {}) as { name?: unknown; throwingHand?: unknown };
    const acute = totalThrowLoad(throwingEntries.slice(-7));
    const chronic = totalThrowLoad(throwingEntries.slice(-28)) / 4;
    const banded = acwrReading(acute, chronic);
    return buildPhysioSummary({
      today: today.openDate,
      athlete: typeof profile.name === "string" ? profile.name : undefined,
      throwingHand: typeof profile.throwingHand === "string" ? profile.throwingHand : undefined,
      pre: (state?.pre ?? {}) as Record<string, unknown>,
      bullpens: (state?.bullpens ?? {}) as Record<string, unknown>,
      games: games.map((game) => ({ date: game.date, pitches: game.pitches })),
      completedTasks: (state?.completedTasks ?? {}) as Record<string, unknown>,
      skippedTasks: (state?.skippedTasks ?? {}) as Record<string, unknown>,
      plannedTaskCount: (on) => tasksOn(on).length,
      // The protocol's own words for the day, so the physio reads the same
      // sentence the athlete did rather than a paraphrase of it.
      recoveryLabel: (on) => {
        const found = recoveryForDay(on, loggedOutings, knownBodyweight, recoveryEquipment);
        return found ? `${found.tier} protocol, day ${found.dayOffset + 1} — ${found.day.title}` : null;
      },
      exams: armExams,
      workload: banded ? { ratio: banded.ratio, inBand: banded.inBand } : undefined,
      restProblems: restProblems(loggedOutings),
      // Every report in the window, resolved ones included: a physio needs to
      // see the elbow that flared twice and settled as well as the one still
      // going. Triaged as of the day it was made rather than today, so the
      // tier shown is the decision that was actually acted on.
      painReports: sorenessReports
        .filter((report) => report.date >= addDays(today.openDate, -SHARE_DAYS))
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((report) => {
          const asOf = activeReports(sorenessReports, report.date).find(
            (entry) => entry.report.id === report.id
          );
          return {
            date: report.date,
            region: REGION_LABELS[report.region] ?? report.region,
            severity: report.severity,
            quality: QUALITY_LABELS[report.quality] ?? report.quality,
            timing: TIMING_LABELS[report.timing] ?? report.timing,
            trend: TREND_LABELS[report.trend] ?? report.trend,
            tier: asOf?.triage.tier ?? triageReport(report).tier,
            daysRunning: asOf?.daysRunning ?? 0,
            ...(report.note ? { note: report.note } : {}),
            ...(report.resolvedOn ? { resolvedOn: report.resolvedOn } : {}),
          };
        }),
      // Only when this link was created — or amended — to carry them.
      ...(options.bloods && bloodPanels.length
        ? { bloods: { panels: bloodPanels, context: bloodContext } }
        : {}),
    });
  }, [
    state,
    today.openDate,
    throwingEntries,
    games,
    tasksOn,
    loggedOutings,
    knownBodyweight,
    recoveryEquipment,
    armExams,
    sorenessReports,
    bloodPanels,
    bloodContext,
  ]);


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
    const names = loggedTasks.names;

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
  }, [state, loggedTasks]);

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
        tonnageKg: loggedTonnage(
          setLog,
          Object.fromEntries(tasks.map((task) => [task.id, setUnit(task)]))
        ),
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
    if (outcome.changed) update(() => outcome.state, { record: false });
    setSyncStatus(
      outcome.status === "conflict-resolved"
        ? "Merged with another device's newer data."
        : `Synced at ${new Date().toLocaleTimeString()}`
    );
  }, [api, state, syncKey, update]);

  // --- Whose data is on this device ------------------------------------------
  //
  // Several players can share one phone. The local copy is one player's, so
  // when a different account signs in it starts empty and fills from that
  // account's cloud copy; without this, autosave would merge the last player's
  // training into the new player's account. A brand-new player always starts
  // empty for the same reason, even on a device no account has claimed yet.
  const handleAccount = useCallback(
    (account: { userId: string; syncKey: string; isNew: boolean }) => {
      let owner: string | null = null;
      try {
        owner = window.localStorage.getItem(ACCOUNT_OWNER_STORAGE);
      } catch {
        owner = null;
      }
      if (account.isNew || (owner && owner !== account.userId)) {
        reset();
        lastSynced.current = "";
      }
      try {
        window.localStorage.setItem(ACCOUNT_OWNER_STORAGE, account.userId);
      } catch {
        // Private mode: nothing to remember the owner in; the next sign-in rechecks.
      }
      if (isValidSyncKey(account.syncKey)) setSyncKey(account.syncKey);
    },
    [reset, setSyncKey]
  );

  // Signing out saves what is pending, then clears this device, so the next
  // person to pick it up does not open someone else's training.
  const handleSignedOut = useCallback(async () => {
    if (state && isValidSyncKey(syncKey)) {
      await syncNow({ api, syncKey }, state).catch(() => undefined);
    }
    reset();
    lastSynced.current = "";
    setSyncKeyState("");
    try {
      window.localStorage.removeItem(SYNC_KEY_STORAGE);
      window.localStorage.removeItem(ACCOUNT_OWNER_STORAGE);
    } catch {
      // Already gone.
    }
  }, [api, reset, state, syncKey]);

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
    const fingerprint = snapshotFingerprint(state);
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
          lastSynced.current = snapshotFingerprint(outcome.state);
          update(() => outcome.state, { record: false });
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

  // --- Training history ----------------------------------------------------
  //
  // Every local change is appended to `trainingHistory` by `update`; this is
  // what gets it off the device. On first run with a key it reads the
  // server's copy (so a second device, or one that used the prototype, shows
  // the full record), then uploads whatever is pending. Uploads are
  // idempotent server-side, so a retry after a lost response is harmless.
  //
  // A failure backs off for a minute rather than retrying on every keystroke;
  // the events stay pending and the card says so.
  const historyPulledFor = useRef("");
  const historyBusy = useRef(false);
  const historyFailedAt = useRef(0);
  const [historyStatus, setHistoryStatus] = useState("");

  // --- Ballclubz -------------------------------------------------------------
  //
  // League game lines, read off the athlete's public Ballclubz player page each
  // time the app opens and filed into the game log. The server fetches the
  // page (Ballclubz sends no CORS headers); merging happens here, because the
  // game log lives in the encrypted state only this device can write.
  const ballclubzUrl = (() => {
    const stored = (state?.profile as { ballclubzUrl?: unknown } | undefined)?.ballclubzUrl;
    if (typeof stored === "string") return stored;
    // Found by name on the team roster (below) for everyone else.
    const athlete = readAthleteProfile(state?.profile);
    return athlete.team === "Coomera Cubs" && /sippel/i.test(athlete.name ?? "") ? DEFAULT_BALLCLUBZ_URL : "";
  })();
  const [ballclubzStatus, setBallclubzStatus] = useState("");
  const [ballclubzBusy, setBallclubzBusy] = useState(false);
  const ballclubzChecked = useRef("");

  const checkBallclubz = useCallback(async () => {
    if (!ballclubzUrl) return;
    setBallclubzBusy(true);
    try {
      const result = await api.ballclubzPitching(ballclubzUrl);
      const counted = mergeBallclubzOutings(games, result.outings);
      // The official batting line is the league's, not the athlete's: stored
      // whole each time, replacing the last copy.
      const batting = result.batting ?? [];
      if (batting.length && JSON.stringify(batting) !== JSON.stringify((state?.profile as { leagueBatting?: unknown } | undefined)?.leagueBatting)) {
        update((draft) => ({
          ...draft,
          profile: { ...((draft.profile ?? {}) as object), leagueBatting: batting },
        }));
      }
      if (counted.added || counted.updated) {
        update((draft) => {
          const merged = mergeBallclubzOutings(readGames(draft.games), result.outings);
          return merged.added || merged.updated ? { ...draft, games: merged.games } : draft;
        });
      }
      const at = new Date().toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
      setBallclubzStatus(
        `Checked ${at}: ${result.outings.length} ${result.outings.length === 1 ? "outing" : "outings"} on Ballclubz` +
          (counted.added || counted.updated
            ? ` — ${counted.added} new${counted.updated ? `, ${counted.updated} corrected` : ""}.`
            : ", all already in your game log.")
      );
    } catch (error) {
      setBallclubzStatus(`Couldn't check Ballclubz: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBallclubzBusy(false);
    }
  }, [api, ballclubzUrl, games, update]);

  // The team's draw from its league (GBL, ABL — see leagues.ts), and where the
  // league has player pages, this player's page on its roster: refreshed once a
  // session (and again whenever the team or name changes). The draw becomes the
  // athlete's fixtures; the page link, the first time it is found, becomes the
  // Ballclubz link above — never overwriting one the athlete set themselves.
  const teamChecked = useRef("");
  useEffect(() => {
    if (!state || !isValidSyncKey(syncKey)) return;
    const athlete = readAthleteProfile(state.profile);
    const club = leagueTeam(athlete.team)?.team;
    if (!club || (club.name === "Coomera Cubs" && !athlete.playerType)) return;
    const key = `${club.name}|${athlete.name ?? ""}`;
    if (teamChecked.current === key) return;
    teamChecked.current = key;
    api
      .leagueTeam(club.name, athlete.name ?? "")
      .then((result) =>
        update(
          (draft) => {
            const profile = (draft.profile ?? {}) as Record<string, unknown>;
            return {
              ...draft,
              profile: {
                ...profile,
                teamDraw: { team: result.team, fetchedAt: result.fetchedAt, games: result.fixtures },
                ...(result.playerPage && typeof profile.ballclubzUrl !== "string" ? { ballclubzUrl: result.playerPage } : {}),
              },
            };
          }
          // Recorded as a local change, so sync keeps it rather than the
          // older cloud copy of the profile.
        )
      )
      .catch(() => {
        // Offline or Ballclubz down: the fixtures already stored stand, and
        // the next session tries again.
        teamChecked.current = "";
      });
  }, [api, state, syncKey, update]);

  useEffect(() => {
    if (!state || !isValidSyncKey(syncKey) || !ballclubzUrl) return;
    if (ballclubzChecked.current === ballclubzUrl) return;
    ballclubzChecked.current = ballclubzUrl;
    void checkBallclubz();
  }, [state, syncKey, ballclubzUrl, checkBallclubz]);

  useEffect(() => {
    if (!state || !isValidSyncKey(syncKey) || historyBusy.current) return;
    if (Date.now() - historyFailedAt.current < HISTORY_RETRY_MS) return;
    const needsPull = historyPulledFor.current !== syncKey;
    if (!needsPull && !pendingHistoryEvents(state.trainingHistory).length) return;

    const timer = window.setTimeout(async () => {
      historyBusy.current = true;
      const deps = { api, syncKey };
      let history: unknown = state.trainingHistory;
      let error = "";
      try {
        if (needsPull) {
          history = await pullRemoteHistory(deps, history);
          historyPulledFor.current = syncKey;
        }
        const pushed = await pushPendingHistory(deps, history);
        history = pushed.history;
        error = pushed.error ?? "";
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
      } finally {
        historyBusy.current = false;
      }
      historyFailedAt.current = error ? Date.now() : 0;
      setHistoryStatus(error ? `Upload failed: ${error}` : "");
      update(
        (draft) => ({ ...draft, trainingHistory: mergeTrainingHistories(draft.trainingHistory, history) }),
        { record: false }
      );
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [api, state, syncKey, update]);

  // --- Keeping the physio's link current -----------------------------------
  //
  // A share the athlete has to remember to refresh is a share that goes stale
  // in a fortnight, which is the same as not having one. So it re-publishes
  // itself as the workspace changes — but on a much slower clock than autosave,
  // because a physio does not need the summary to move while a slider is being
  // dragged, and each publish is a re-encrypt and an upload of the whole
  // summary. At most once every quarter of an hour, and only when something has
  // actually changed since the last one.
  const lastShared = useRef<string>("");
  const sharedAt = useRef(0);

  useEffect(() => {
    if (!state || !isValidSyncKey(syncKey)) return;
    const share = readStoredShare();
    if (!share) return;
    const fingerprint = JSON.stringify(state);
    if (fingerprint === lastShared.current) return;
    const wait = Math.max(SHARE_REFRESH_MS - (Date.now() - sharedAt.current), AUTOSAVE_DELAY_MS * 2);

    const timer = window.setTimeout(() => {
      lastShared.current = fingerprint;
      sharedAt.current = Date.now();
      // A failed refresh is not worth telling the athlete about mid-session:
      // the link still opens, it simply shows the previous snapshot, and the
      // next change tries again.
      // The link's own answer about blood results, not the card's: a
      // background refresh must never widen what an existing link discloses.
      publishShare(api, share, buildPhysioSummaryNow({ bloods: share.bloods === true })).catch(() => {
        lastShared.current = "";
      });
    }, wait);

    return () => window.clearTimeout(timer);
  }, [api, state, syncKey, buildPhysioSummaryNow]);

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
      gameRole: GameRole | null;
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
        ...(detail.gameRole ? { gameRole: detail.gameRole } : {}),
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
  // The team on screen is the athlete's own: their club's colours and badge
  // where the app has them (the Cubs and Norths), the plain palette otherwise.
  // The winter club only applies to an athlete who has one — the Cubs' original
  // athlete plays winter for Norths, which is what an unset winter club means
  // for a Cubs profile written before the question existed.
  const athlete = readAthleteProfile(state.profile);
  const winterClub = winterClubOf(state.profile);
  const team = teamBranding(winter && winterClub ? winterClub : athlete.team ?? "Coomera Cubs");
  const needsProfile = !profileComplete(state.profile) && view !== "account";
  const role = athlete.playerType ?? "pitcher";
  // A position player has no throwing pages; a pitcher no hitting page. A
  // stale link to one lands on Today instead of an empty screen.
  const offRole =
    (!rolePitches(role) && (view === "workload" || view === "mechanics")) || (!roleHits(role) && view === "hitting");
  const shown: Page | null = needsProfile ? null : offRole ? "session" : view;
  const saveProfile = (answers: AthleteProfile) =>
    update((draft) => ({
      ...draft,
      profile: {
        ...((draft.profile ?? {}) as object),
        ...answers,
        // Club nights drive the training overlay. An existing setting keeps
        // its start date, so past weeks read the same as they did.
        teamTraining: {
          days: answers.schedule.training,
          from: (draft.profile as { teamTraining?: unknown } | undefined)?.teamTraining
            ? readTeamTraining((draft.profile as { teamTraining?: unknown }).teamTraining).from
            : (new Date().toISOString().slice(0, 10) as IsoDate),
          club: answers.team,
        },
        // The names older code reads, kept in step.
        summerTeam: answers.team,
        throwingHand: answers.throws,
      },
    }));

  // Today's throw count, on the Throwing tab. The same card the workout used
  // to carry: it tallies from ticked tasks and can be overridden by hand.
  const throwCard = (
    <ThrowCountCard
      alwaysShow
      tally={throwTally ?? null}
      entry={throwEntry ?? null}
      onSave={(entry) =>
        update((draft) => ({
          ...draft,
          bullpens: { ...draft.bullpens, [date]: { date, ...entry, source: "manual" } },
        }))
      }
      onUseAuto={() =>
        update((draft) => {
          const bullpens = { ...((draft.bullpens ?? {}) as Record<string, ThrowingRecord | undefined>) };
          delete bullpens[date];
          return reconcileThrows({ ...draft, bullpens }, date, completed[date] ?? []);
        })
      }
    />
  );

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
        const hand =
          role === "position"
            ? athlete.bats === "Left"
              ? "Bats L"
              : athlete.bats === "Switch"
                ? "Bats S"
                : "Bats R"
            : role === "two-way"
              ? `Two-way · ${p?.throwingHand === "Left" ? "LHP" : "RHP"}`
              : p?.throwingHand === "Left"
                ? "LHP"
                : "RHP";
        return p?.weight ? `${hand} · ${p.weight} kg` : hand;
      })()}
      role={role}
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
      {needsProfile && <ProfileSetup profile={state.profile} onSave={saveProfile} />}

      {/* Today: the week strip, then check-in → workout → check-out, all on
          one screen. Dashboard and the separate check-in page fold into it. */}
      {shown === "session" && (
        <DailyPlan
          sidePanel={false}
          team={{ name: team.name, logo: team.logo, alt: team.alt }}
          // The game log lives in the game day's Compete stage: log the outing
          // where the outing is on the plan.
          stageExtras={{
            Compete: role === "position" ? (
              <button type="button" className="btn btn-dark" onClick={() => setPage("hitting")}>
                Log at-bats
              </button>
            ) : (
              <>
              {role === "two-way" && (
                <button type="button" className="btn btn-outline" onClick={() => setPage("hitting")}>
                  Log at-bats
                </button>
              )}
              <GameLog
                compact
                date={date}
                games={games}
                onSave={(game: Game) => update((draft) => ({ ...draft, games: [...readGames(draft.games), game] }))}
                onRemove={(id: string) =>
                  update((draft) => ({ ...draft, games: readGames(draft.games).filter((game) => game.id !== id) }))
                }
              />
              </>
            ),
          }}
          checkIn={
            <HealthForm
              date={date}
              plan={plan}
              existing={state.pre}
              onSubmitted={handleReadinessSubmitted}
              api={api}
              prefill={state.healthPrefill}
              onPrefill={handleHealthPrefill}
              hasSyncKey={isValidSyncKey(syncKey)}
              gameDay={isGameDay}
              pitcher={role !== "position"}
            />
          }
          checkOut={
            <Tracking
              mode="checkout"
              throwLog={role === "position" ? undefined : throwCard}
              date={date}
              plan={plan}
              reports={reports}
              onReport={(report) => update((draft) => ({ ...draft, post: { ...draft.post, [report.date]: report } }))}
              healthPrefill={state.healthPrefill}
              submissions={state.pre}
              loggedGamePitches={games.find((game) => game.date === date && Number(game.pitches) > 0)?.pitches ?? null}
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
          }
          beforeWorkout={
            <>
              <SorenessCard
                date={date}
                active={soreness}
                changes={sessionWithRecovery.changes}
                referral={sessionWithRecovery.referral}
                onOpenShare={() => setPage("profile")}
                onReport={(report) =>
                  update((draft) => ({
                    ...draft,
                    soreness: [...readReports(draft.soreness), report],
                  }))
                }
                onResolve={(region, on) =>
                  update((draft) => ({
                    ...draft,
                    // Stamped onto every unresolved report for the region rather than
                    // deleting them: the history is what the physio reads, and an
                    // elbow that flared three times is a different story from one
                    // that flared once.
                    soreness: readReports(draft.soreness).map((report) =>
                      report.region === region && !report.resolvedOn ? { ...report, resolvedOn: on } : report,
                    ),
                  }))
                }
              />
              {isGameDay && submission && (
                <GameRoleCard
                  pitcher={role !== "position"}
                  value={gameRole}
                  onChange={(role) =>
                    update((draft) => {
                      const current = draft.pre[date] as ReadinessSubmission | undefined;
                      if (!current) return draft;
                      return { ...draft, pre: { ...draft.pre, [date]: { ...current, gameRole: role } } };
                    })
                  }
                />
              )}
            </>
          }
          date={date}
          plan={plan}
          submission={submission}
          recoveryNote={recoveryNote}
          scheduleWarning={clash?.message ?? null}
          setLog={setLog}
          progression={progression}
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
            update((draft) =>
              reconcileThrows(
                {
                  ...draft,
                  completedTasks: { ...draft.completedTasks, [forDate]: next },
                  taskCompletionUpdatedAt: {
                    ...draft.taskCompletionUpdatedAt,
                    [forDate]: new Date().toISOString(),
                  },
                },
                forDate,
                next,
              ),
            )
          }
          throwTally={throwTally}
          throwEntry={throwEntry}
          weekGames={gamesInWeekOf(selectedWeekPlan)}
          onSetThrows={(forDate, entry) =>
            update((draft) => ({
              ...draft,
              bullpens: {
                ...draft.bullpens,
                [forDate]: { date: forDate, ...entry, source: "manual" },
              },
            }))
          }
          onUseAutoThrows={(forDate) =>
            update((draft) => {
              const bullpens = { ...((draft.bullpens ?? {}) as Record<string, ThrowingRecord | undefined>) };
              delete bullpens[forDate];
              return reconcileThrows({ ...draft, bullpens }, forDate, completed[forDate] ?? []);
            })
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

      {shown === "workload" && (
        <>
          <PageHead eyebrow="Throwing" title="Your arm's work." intro={formatIsoDate(date)} />
          <Segments label="Throwing sections" options={THROWING_TABS} value={throwingTab} onChange={setThrowingTab} />
          {throwingTab === "today" && weekFromTasks(tasks) !== null && (
            <VelocityBlock week={weekFromTasks(tasks) as number} games={gamesInWeekOf(selectedWeekPlan)} />
          )}
          {throwingTab === "mechanics" ? (
            <Mechanics
              api={api}
              date={date}
              hasSyncKey={isValidSyncKey(syncKey)}
              captures={captures}
              throws={
                (state.profile as { throwingHand?: string } | undefined)?.throwingHand === "Left" ? "left" : "right"
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
          ) : (
            <Workload
              section={throwingTab}
              throwCard={throwCard}
              date={date}
              plan={plan}
              entries={throwingEntries}
              intentPercent={intentPercent}
              gameDay={gameOn(date)}
              onLog={(entry) =>
                // Logged here by hand, so it is stamped as the athlete's and the
                // session's automatic count will not overwrite it.
                update((draft) => ({
                  ...draft,
                  bullpens: { ...draft.bullpens, [entry.date]: { ...entry, source: "manual" } },
                }))
              }
              pitches={pitches}
              priorPitches={priorPitches}
              games={games}
              onSaveGame={(game: Game) => update((draft) => ({ ...draft, games: [...readGames(draft.games), game] }))}
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
        </>
      )}

      {shown === "mechanics" && (
        <Mechanics
          api={api}
          date={date}
          hasSyncKey={isValidSyncKey(syncKey)}
          captures={captures}
          throws={(state.profile as { throwingHand?: string } | undefined)?.throwingHand === "Left" ? "left" : "right"}
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

      {shown === "tracking" && (
        <>
          <PageHead eyebrow="Progress" title="What's changing." intro="Trends, testing and bloods over time." />
          <Segments label="Progress sections" options={PROGRESS_TABS} value={progressTab} onChange={setProgressTab} />
          {progressTab === "trends" && (
            <Tracking
              mode="history"
              date={date}
              plan={plan}
              reports={reports}
              onReport={(report) => update((draft) => ({ ...draft, post: { ...draft.post, [report.date]: report } }))}
              healthPrefill={state.healthPrefill}
              submissions={state.pre}
              loggedGamePitches={games.find((game) => game.date === date && Number(game.pitches) > 0)?.pitches ?? null}
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
          {progressTab === "testing" && (
            <>
              <TrainingMaxes
                maxes={readTrainingMaxes(state?.pbs)}
                onChange={(key, value) =>
                  update((draft) => ({ ...draft, pbs: setTrainingMax(draft.pbs, key, value) as never }))
                }
              />
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
              <RetestSheet
                entries={retests}
                today={today.openDate}
                week={selectedWeek}
                onChange={(next) =>
                  update((draft) => ({
                    ...draft,
                    profile: { ...(draft.profile ?? {}), retests: next },
                  }))
                }
              />
              <BaselineTesting />
              <TransferCard transfer={transfer} />
            </>
          )}
          {progressTab === "bloods" && (
            <Bloods
              panels={bloodPanels}
              today={today.openDate}
              contextFor={bloodContext}
              onChange={(next) =>
                update((draft) => ({
                  ...draft,
                  profile: { ...(draft.profile ?? {}), bloodPanels: next },
                }))
              }
            />
          )}
        </>
      )}

      {shown === "bloods" && (
        <Bloods
          panels={bloodPanels}
          today={today.openDate}
          contextFor={bloodContext}
          onChange={(next) =>
            update((draft) => ({
              ...draft,
              profile: { ...(draft.profile ?? {}), bloodPanels: next },
            }))
          }
        />
      )}

      {shown === "annual" && (
        <>
          <AnnualPlan
            initialView="month"
            selectedWeek={selectedWeek}
            onSelectWeek={setSelectedWeek}
            today={today.openDate}
          />
          {/* Adding a game belongs on the page the season is read from.
              Entering one here rebuilds that day as a game day straight away. */}
          <FixtureSettings
            currentWeek={today.selectedWeek}
            selectedWeek={selectedWeek}
            fixtures={athleteFixtures}
            today={today.openDate}
            onSelectWeek={setSelectedWeek}
            onChange={(next) =>
              update((draft) => ({
                ...draft,
                profile: { ...(draft.profile ?? {}), fixtures: next },
              }))
            }
          />
        </>
      )}

      {shown === "nutrition" && (
        <Nutrition
          api={api}
          date={date}
          meals={meals}
          hydrationLitres={hydrationLitres}
          targets={targets}
          activeCalories={activeCaloriesToday}
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
                  litres === "reset" ? 0 : Math.max(0, Number(((current.hydration?.[date] ?? 0) + litres).toFixed(2))),
              },
            }))
          }
        />
      )}

      {shown === "hitting" && (
        <Hitting
          date={date}
          games={readHittingGames(state.hitting)}
          bats={athlete.bats ?? "Right"}
          leagueBatting={
            Array.isArray((state.profile as { leagueBatting?: unknown })?.leagueBatting)
              ? ((state.profile as { leagueBatting: BattingLine[] }).leagueBatting)
              : []
          }
          onSaveGame={(game: HittingGame) =>
            update((draft) => ({
              ...draft,
              hitting: { ...((draft.hitting ?? {}) as Record<string, HittingGame>), [game.date]: game },
            }))
          }
        />
      )}

      {shown === "integrations" && <Integrations api={api} hasSyncKey={isValidSyncKey(syncKey)} />}

      {/* Settings: how the programme fits your week and your kit, and who
          you share it with. Testing data moved to Progress; account and
          backup have their own page. */}
      {shown === "profile" && (
        <>
          <PageHead eyebrow="Settings" title="Your programme." intro="Profile, club nights, recovery kit, league games, sharing." />
          <ProfileCard profile={state.profile} onSave={saveProfile} />
          <RecoverySettings
            equipment={recoveryEquipment}
            intentPercent={intentPercent}
            teamTraining={teamTraining}
            onTeamTraining={(next) =>
              update((draft) => ({
                ...draft,
                profile: { ...(draft.profile ?? {}), teamTraining: next },
              }))
            }
            onEquipment={(next) =>
              update((draft) => ({
                ...draft,
                profile: { ...(draft.profile as object), recoveryEquipment: next },
              }))
            }
            onIntentPercent={(next) =>
              update((draft) => ({
                ...draft,
                profile: { ...(draft.profile as object), intentPercent: next },
              }))
            }
          />
          <PhysioShare
            api={api}
            hasSyncKey={isValidSyncKey(syncKey)}
            buildSummary={buildPhysioSummaryNow}
            hasBloods={bloodPanels.length > 0}
          />
          <BallclubzCard
            url={ballclubzUrl}
            status={ballclubzStatus}
            busy={ballclubzBusy}
            hasSyncKey={isValidSyncKey(syncKey)}
            onChange={(next) =>
              update((draft) => ({ ...draft, profile: { ...(draft.profile ?? {}), ballclubzUrl: next } }))
            }
            onCheckNow={() => void checkBallclubz()}
          />
          {/* The BFR cuff block: reference rather than a daily task — twice a
              week, and it depends on equipment the athlete may not have. */}
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
        </>
      )}

      {shown === "account" && (
        <>
          <Account
            api={api}
            syncKey={syncKey}
            onSyncKey={setSyncKey}
            onAccount={handleAccount}
            onSignedOut={handleSignedOut}
            onSyncNow={handleSyncNow}
            syncStatus={syncStatus}
            state={state}
            onReplaceState={(next) => update(() => next, { record: false })}
          />
          <TrainingHistoryCard
            history={state?.trainingHistory}
            hasSyncKey={isValidSyncKey(syncKey)}
            status={historyStatus}
          />
        </>
      )}
    </Shell>
  );
}

export type { Page, ThrowIntent };
