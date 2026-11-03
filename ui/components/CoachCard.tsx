import { useEffect, useState } from "react";
import { PitchingOsApi } from "../../src/domain/api";
import { CoachedAthlete, coachAction, readCoachAccess } from "../../src/domain/coach";
import { Alert, Card, CardHead } from "./Page";

/**
 * The owner's athlete list. Ask a player for coach access; once they allow it,
 * open their app on this device to set up their schedule, programme and the
 * rest exactly as they would.
 */
export function CoachCard({
  api,
  onOpen,
}: {
  api: PitchingOsApi;
  onOpen: (athlete: { id: string; name: string }, syncKey: string) => void | Promise<void>;
}) {
  const [athletes, setAthletes] = useState<CoachedAthlete[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .listAthletes()
      .then((result) => setAthletes(result.athletes.map((a) => ({ ...a, access: readCoachAccess(a.access) }))))
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [api]);

  async function run(id: string, action: () => Promise<void>) {
    setBusy(id);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy("");
    }
  }

  const setAccess = (id: string, access: CoachedAthlete["access"]) =>
    setAthletes((current) => current.map((a) => (a.id === id ? { ...a, access } : a)));

  return (
    <Card aria-label="Coach players">
      <CardHead
        title="Coach players"
        detail="Ask a player for access. Once they allow it in their Account page, open their app here and set it up for them."
      />
      {athletes.length === 0 && !error && <p className="fineprint">No other players yet. Invite one below.</p>}
      {athletes.length > 0 && (
        <ul className="invite-list">
          {athletes.map((athlete) => {
            const step = coachAction(athlete.access);
            return (
              <li key={athlete.id}>
                <div>
                  <strong>{athlete.name}</strong>
                  <small>
                    {step === "open" ? "Allowed you to coach" : step === "waiting" ? "Asked · waiting for them to allow" : "Not coaching"}
                  </small>
                </div>
                <div className="invite-actions">
                  {step === "ask" && (
                    <button
                      className="text-button"
                      type="button"
                      disabled={busy !== ""}
                      onClick={() =>
                        run(athlete.id, async () => {
                          const result = await api.requestCoachAccess(athlete.id);
                          setAccess(athlete.id, readCoachAccess(result.access));
                        })
                      }
                    >
                      {busy === athlete.id ? "Asking…" : "Ask to coach"}
                    </button>
                  )}
                  {step === "open" && (
                    <button
                      className="text-button"
                      type="button"
                      disabled={busy !== ""}
                      onClick={() =>
                        run(athlete.id, async () => {
                          const opened = await api.openAthlete(athlete.id);
                          await onOpen(opened.athlete, opened.syncKey);
                        })
                      }
                    >
                      {busy === athlete.id ? "Opening…" : `Open ${athlete.name.split(" ")[0]}'s app`}
                    </button>
                  )}
                  {step !== "ask" && (
                    <button
                      className="text-button danger-text"
                      type="button"
                      disabled={busy !== ""}
                      onClick={() =>
                        run(athlete.id, async () => {
                          await api.removeCoachAccess(athlete.id);
                          setAccess(athlete.id, "none");
                        })
                      }
                    >
                      {step === "waiting" ? "Withdraw" : "Stop coaching"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
    </Card>
  );
}

/**
 * The athlete's side: a coach has asked, or already has access. Shown on the
 * Account page, and on Today while a request is waiting so it is not missed.
 */
export function CoachRequestCard({
  coach,
  onAnswer,
  onEnd,
}: {
  coach: { name: string; access: CoachedAthlete["access"] };
  onAnswer: (allow: boolean) => Promise<void>;
  onEnd: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  const pending = coach.access === "pending";
  return (
    <Card aria-label="Coach access">
      <CardHead
        title={pending ? `${coach.name} wants to coach you` : "Coach access"}
        detail={
          pending
            ? `If you allow it, ${coach.name} can open your app to set up your schedule and programme, and see and edit your training data. You can remove it any time.`
            : `${coach.name} can open your app to see and edit your training. Remove it any time.`
        }
      />
      <div className="cloud-actions">
        {pending ? (
          <>
            <button type="button" className="btn btn-dark" disabled={busy} onClick={() => run(() => onAnswer(true))}>
              Allow
            </button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => run(() => onAnswer(false))}>
              Decline
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-outline" disabled={busy} onClick={() => run(onEnd)}>
            Remove coach access
          </button>
        )}
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
    </Card>
  );
}
