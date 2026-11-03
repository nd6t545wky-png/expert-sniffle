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
