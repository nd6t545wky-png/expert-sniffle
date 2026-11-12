/**
 * Coaching: the owner opening another player's workspace on their own device.
 *
 * While coaching, this device holds the athlete's data and sync key instead of
 * the coach's. What is remembered here is only who is being coached, so a
 * reload stays in the athlete's app rather than silently switching back, and so
 * the coach's own sign-in is not mistaken for a different player taking over.
 */

export type CoachAccess = "none" | "pending" | "active";

export interface CoachedAthlete {
  id: string;
  name: string;
  access: CoachAccess;
}

export interface CoachingSession {
  /** The signed-in account doing the coaching. */
  coachId: string;
  athleteId: string;
  athleteName: string;
}

export const COACHING_STORAGE = "dylan-pitching-os-coaching-v1";

export function readCoachAccess(value: unknown): CoachAccess {
  return value === "pending" || value === "active" ? value : "none";
}

/** A stored coaching session, or null for anything malformed. */
export function parseCoachingSession(raw: string | null | undefined): CoachingSession | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const coachId = typeof value?.coachId === "string" ? value.coachId : "";
    const athleteId = typeof value?.athleteId === "string" ? value.athleteId : "";
    const athleteName = typeof value?.athleteName === "string" ? value.athleteName.trim() : "";
    if (!coachId || !athleteId || coachId === athleteId) return null;
    return { coachId, athleteId, athleteName: athleteName || "Athlete" };
  } catch {
    return null;
  }
}

/**
 * Whether an account sign-in is just the coach's own session reporting in.
 * While coaching, the device's data belongs to the athlete, so the coach's
 * own key must not replace it.
 */
export function isCoachSignIn(session: CoachingSession | null, userId: string): boolean {
  return Boolean(session && session.coachId === userId);
}

/** The coach's line for each athlete: what they can do next. */
export function coachAction(access: CoachAccess): "ask" | "waiting" | "open" {
  return access === "active" ? "open" : access === "pending" ? "waiting" : "ask";
}

/** One athlete at a glance, read off their synced data. */
export interface AthleteSummary {
  team: string;
  /** Today's check-in, if they have done it. */
  readiness: { score: number; level: string } | null;
  lastCheckIn: string | null;
  /** Check-ins in the last seven days. */
  checkInsThisWeek: number;
  tasksDoneToday: number;
  lastGame: { date: string; opponent: string; pitches: number } | null;
  hasBaseline: boolean;
}

export function athleteSummary(state: Record<string, unknown>, today: string): AthleteSummary {
  const record = (value: unknown) => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});
  const profile = record(state.profile);
  const pre = record(state.pre);
  const days = Object.keys(pre).filter((day) => day <= today).sort();
  const weekAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 6 * 86_400_000).toISOString().slice(0, 10);
  const todays = record(pre[today]);
  const done = record(state.completedTasks)[today];
  const games = (Array.isArray(state.games) ? state.games : [])
    .map(record)
    .filter((game) => typeof game.date === "string")
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return {
    team: typeof profile.team === "string" ? profile.team : "",
    readiness:
      typeof todays.score === "number" ? { score: Math.round(todays.score), level: String(todays.planLevel ?? "") } : null,
    lastCheckIn: days[days.length - 1] ?? null,
    checkInsThisWeek: days.filter((day) => day >= weekAgo).length,
    tasksDoneToday: Array.isArray(done) ? done.length : 0,
    lastGame: games[0]
      ? { date: String(games[0].date), opponent: String(games[0].opponent ?? ""), pitches: Number(games[0].pitches) || 0 }
      : null,
    hasBaseline: Boolean(profile.baseline),
  };
}

/** "Checked in today · 82 full · 5 tasks done · last game 8 Nov, 64 pitches". */
export function summaryLine(summary: AthleteSummary, today: string): string {
  const short = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });
  const parts = [
    summary.readiness
      ? `Checked in today · readiness ${summary.readiness.score}${summary.readiness.level ? ` (${summary.readiness.level})` : ""}`
      : summary.lastCheckIn
        ? `No check-in today · last ${short(summary.lastCheckIn)}`
        : "Never checked in",
    `${summary.checkInsThisWeek}/7 check-ins this week`,
    summary.readiness ? `${summary.tasksDoneToday} task${summary.tasksDoneToday === 1 ? "" : "s"} done today` : "",
    summary.lastGame
      ? `last game ${short(summary.lastGame.date)}${summary.lastGame.pitches ? `, ${summary.lastGame.pitches} pitches` : ""}`
      : "",
    summary.hasBaseline ? "" : "no baseline testing yet",
  ];
  return parts.filter(Boolean).join(" · ");
}
