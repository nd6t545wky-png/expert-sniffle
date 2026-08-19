/**
 * What the physio sees.
 *
 * A whole application of its own, deliberately: it mounts instead of the
 * athlete's app rather than as a page inside it. There is no state to load, no
 * check-in to submit, no sync key on the device — so there is nothing here
 * that could write to the workspace even if it wanted to. Read-only is the
 * shape of the code, not a flag somewhere.
 *
 * It takes the id from the query and the key from the fragment, asks the
 * server for ciphertext, and decrypts in the browser. The server never sees
 * the key, so it can serve this page without ever being able to read it.
 */

import { useEffect, useState } from "react";
import { PitchingOsApi } from "../../src/domain/api";
import { decryptJsonEnvelope } from "../../src/domain/sync";
import {
  PhysioArmScreen,
  PhysioDay,
  PhysioSummary,
  readPhysioSummary,
  readShareLink,
} from "../../src/domain/physioShare";
import { Alert, Card, CardHead, EmptyState, PageHead } from "./Page";

type Status =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; summary: PhysioSummary; updatedAt: string };

const INTENT_LABEL: Record<string, string> = {
  recovery: "recovery intent",
  low: "low intent",
  moderate: "moderate intent",
  high: "high intent",
};

function dayLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (!Number.isFinite(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function sorenessLine(soreness: PhysioDay["soreness"]): string | null {
  if (!soreness) return null;
  const parts = [
    soreness.shoulder !== undefined ? `shoulder ${soreness.shoulder}` : null,
    soreness.elbow !== undefined ? `elbow ${soreness.elbow}` : null,
    soreness.forearm !== undefined ? `forearm ${soreness.forearm}` : null,
  ].filter(Boolean);
  return parts.length ? `Soreness ${parts.join(" · ")} (0–10, higher is worse)` : null;
}

function throwingLine(throwing: PhysioDay["throwing"]): string | null {
  if (!throwing) return null;
  const parts: string[] = [];
  if (throwing.throws !== null && throwing.throws !== undefined) parts.push(`${throwing.throws} throws`);
  if (throwing.gamePitches !== null && throwing.gamePitches !== undefined) {
    parts.push(`${throwing.gamePitches} game pitches`);
  }
  if (throwing.intent) parts.push(INTENT_LABEL[throwing.intent] ?? throwing.intent);
  return parts.length ? parts.join(" · ") : null;
}

function ArmScreenRow({ screen }: { screen: PhysioArmScreen }) {
  return (
    <tr>
      <td>{dayLabel(screen.date)}</td>
      <td>{screen.armScorePercent === null ? "—" : `${screen.armScorePercent}%`}</td>
      <td>{screen.erIrRatio === null ? "—" : screen.erIrRatio.toFixed(2)}</td>
      <td>{screen.limbSymmetryPercent === null ? "—" : `${screen.limbSymmetryPercent}%`}</td>
    </tr>
  );
}

export function PhysioView({ api = new PitchingOsApi() }: { api?: PitchingOsApi }) {
  const [status, setStatus] = useState<Status>({ state: "loading" });

  useEffect(() => {
    let live = true;
    const link = readShareLink(window.location.search, window.location.hash);
    if (!link) {
      setStatus({ state: "error", message: "This link is incomplete. Ask for the full link again — the part after the # is what unlocks it." });
      return;
    }

    (async () => {
      try {
        const response = await api.readShare(link.id);
        const decrypted = await decryptJsonEnvelope(response.payload, link.key);
        const summary = readPhysioSummary(decrypted);
        if (!live) return;
        if (!summary) {
          setStatus({ state: "error", message: "This link opened, but the summary inside it could not be read." });
          return;
        }
        setStatus({ state: "ready", summary, updatedAt: response.updatedAt });
      } catch (error) {
        if (!live) return;
        const message =
          error instanceof Error && /decrypt|operation-specific/i.test(error.message)
            ? "The key in this link does not open this summary. It may have been re-shared since."
            : error instanceof Error
              ? error.message
              : "This link could not be opened.";
        setStatus({ state: "error", message });
      }
    })();

    return () => {
      live = false;
    };
  }, [api]);

  if (status.state === "loading") {
    return (
      <main className="physio-page">
        <EmptyState title="Opening the summary" detail="Decrypting in this browser." />
      </main>
    );
  }

  if (status.state === "error") {
    return (
      <main className="physio-page">
        <PageHead eyebrow="Shared summary" title="Cannot open this link" />
        <Alert tone="warn" role="alert">
          {status.message}
        </Alert>
      </main>
    );
  }

  const { summary } = status;
  const generated = summary.generatedAt ? new Date(summary.generatedAt) : null;

  return (
    <main className="physio-page">
      <PageHead
        eyebrow="Shared with you"
        title={`${summary.athlete} — training summary`}
        intro={`${summary.throwingHand} handed. Last updated ${
          generated && Number.isFinite(generated.getTime()) ? generated.toLocaleString() : status.updatedAt
        }. Read-only.`}
      />

      {summary.workload && summary.workload.ratio !== null && (
        <Card>
          <CardHead title="Acute : chronic workload" detail="Last 7 days against the 28-day average." />
          <p className="physio-figure">{summary.workload.ratio.toFixed(2)}</p>
          <p className="muted">
            {summary.workload.inBand
              ? "Inside the 0.8–1.3 band."
              : "Outside the 0.8–1.3 band — worth a look at the throwing column below."}
          </p>
        </Card>
      )}

      {summary.restProblems.length > 0 && (
        <Card>
          <CardHead title="Rest rules broken" detail="From the throwing log, against Pitch Smart." />
          <ul className="physio-list">
            {summary.restProblems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </Card>
      )}

      {/* First, because it is the reason a physio opens this at all. */}
      {summary.painReports && summary.painReports.length > 0 && (
        <Card>
          <CardHead
            title="Reported pain and soreness"
            detail="What the athlete reported, and what the app did about it that day."
          />
          <div className="physio-scroll">
            <table className="physio-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Where</th>
                  <th scope="col">/10</th>
                  <th scope="col">Feels like</th>
                  <th scope="col">When</th>
                  <th scope="col">Day</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {summary.painReports.map((entry, index) => (
                  <tr key={`${entry.date}-${entry.region}-${index}`}>
                    <td>{dayLabel(entry.date)}</td>
                    <td>{entry.region}</td>
                    <td>{entry.severity}</td>
                    <td>{entry.quality}</td>
                    <td>{entry.timing}</td>
                    <td>{entry.daysRunning + 1}</td>
                    <td>{entry.resolvedOn ? `resolved ${entry.resolvedOn}` : entry.tier}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {summary.painReports.some((entry) => entry.note) && (
            <ul className="physio-list">
              {summary.painReports
                .filter((entry) => entry.note)
                .map((entry, index) => (
                  <li key={`note-${entry.date}-${index}`}>
                    {dayLabel(entry.date)}, {entry.region.toLowerCase()}: “{entry.note}”
                  </li>
                ))}
            </ul>
          )}
        </Card>
      )}

      <Card>
        <CardHead title="Arm strength screens" detail="Handheld dynamometry, throwing arm." />
        {summary.armScreens.length === 0 ? (
          <p className="muted">No screens recorded.</p>
        ) : (
          <div className="physio-scroll">
            <table className="physio-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Arm score</th>
                  <th scope="col">ER:IR</th>
                  <th scope="col">Symmetry</th>
                </tr>
              </thead>
              <tbody>
                {summary.armScreens.map((screen) => (
                  <ArmScreenRow key={screen.date} screen={screen} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHead title="Recent days" detail="Newest first. Days with nothing recorded are left out." />
        {summary.days.length === 0 ? (
          <p className="muted">Nothing recorded in this window.</p>
        ) : (
          <ul className="physio-days">
            {summary.days.map((day) => {
              const soreness = sorenessLine(day.soreness);
              const throwing = throwingLine(day.throwing);
              return (
                <li key={day.date}>
                  <div className="physio-day-head">
                    <strong>{dayLabel(day.date)}</strong>
                    {day.readiness && (
                      <span className="physio-tag">
                        Readiness {day.readiness.score ?? "—"}
                        {day.readiness.planLevel ? ` · ${day.readiness.planLevel}` : ""}
                      </span>
                    )}
                  </div>
                  {soreness && <p className="physio-detail">{soreness}</p>}
                  {throwing && <p className="physio-detail">{throwing}</p>}
                  {day.recovery && <p className="physio-detail">{day.recovery}</p>}
                  {day.session && (
                    <p className="physio-detail">
                      Session {day.session.completed}/{day.session.total} done
                      {day.session.skipped ? `, ${day.session.skipped} skipped` : ""}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <p className="physio-foot">
        This is a snapshot the athlete chose to share. It is encrypted in transit and at rest; the key
        travels only in the link. The athlete can revoke it at any time.
      </p>
    </main>
  );
}
