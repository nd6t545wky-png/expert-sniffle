/**
 * Telling the app something hurts.
 *
 * Designed to be finished standing up, in under a minute, with one thumb —
 * because the moment this gets used is between a bullpen and the car, and a
 * form that takes five minutes gets filled in as "fine". Four taps and a
 * slider: where, how bad, what it feels like, when it shows up.
 *
 * The result is not advice. It is a changed plan, and the card says which of
 * the four things it did — trained as written, trained around it, rested the
 * area, or told the athlete to get it looked at — with the reasoning listed
 * underneath so it can be argued with rather than obeyed.
 */

import { useState } from "react";
import { IsoDate } from "../../src/domain/state";
import {
  ActiveReport,
  BodyRegion,
  PainQuality,
  PainTiming,
  PainTrend,
  QUALITY_LABELS,
  REGION_HINTS,
  REGION_LABELS,
  SorenessReport,
  TIER_LABELS,
  TIMING_LABELS,
  TREND_LABELS,
} from "../../src/domain/soreness";
import { SorenessChange } from "../../src/domain/sorenessTasks";
import { Alert, Card, CardHead } from "./Page";
import { ConfirmButton } from "./ConfirmButton";

const REGIONS = Object.keys(REGION_LABELS) as BodyRegion[];
const QUALITIES = Object.keys(QUALITY_LABELS) as PainQuality[];
const TIMINGS = Object.keys(TIMING_LABELS) as PainTiming[];
const TRENDS = Object.keys(TREND_LABELS) as PainTrend[];

/** Regions offered first, because they are the ones a pitcher reports. */
const COMMON_REGIONS: BodyRegion[] = [
  "elbow_medial",
  "shoulder_front",
  "shoulder_back",
  "forearm",
  "elbow_lateral",
  "lat_teres",
];

function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const TIER_TONE: Record<string, "info" | "warn" | "danger"> = {
  monitor: "info",
  modify: "info",
  hold: "warn",
  refer: "danger",
};

export interface SorenessCardProps {
  date: IsoDate;
  active: ActiveReport[];
  /** What the overlay did to today's plan, so the card can show it. */
  changes?: SorenessChange[];
  referral?: string | null;
  onReport: (report: SorenessReport) => void;
  onResolve: (region: BodyRegion, on: IsoDate) => void;
  /** Opens the physio share, when a referral says to send it. */
  onOpenShare?: () => void;
}

export function SorenessCard({
  date,
  active,
  changes = [],
  referral,
  onReport,
  onResolve,
  onOpenShare,
}: SorenessCardProps) {
  const [open, setOpen] = useState(false);
  const [region, setRegion] = useState<BodyRegion | null>(null);
  const [severity, setSeverity] = useState(4);
  const [quality, setQuality] = useState<PainQuality>("ache");
  const [timing, setTiming] = useState<PainTiming>("during");
  const [trend, setTrend] = useState<PainTrend>("new");
  const [note, setNote] = useState("");
  const [showAllRegions, setShowAllRegions] = useState(false);

  function reset() {
    setOpen(false);
    setRegion(null);
    setSeverity(4);
    setQuality("ache");
    setTiming("during");
    setTrend("new");
    setNote("");
    setShowAllRegions(false);
  }

  function save() {
    if (!region) return;
    onReport({
      id: newId(),
      date,
      region,
      severity,
      quality,
      timing,
      trend,
      ...(note.trim() ? { note: note.trim() } : {}),
      createdAt: new Date().toISOString(),
    });
    reset();
  }

  const offered = showAllRegions ? REGIONS : COMMON_REGIONS;
  const stale = active.filter((entry) => entry.stale);
  const live = active.filter((entry) => !entry.stale);

  /**
   * The quiet state, which is most days.
   *
   * The full card sat above the session heading with the loudest button on the
   * page, so on every day nothing hurt the athlete scrolled past an injury
   * form to reach their training. With nothing reported, nothing to re-confirm
   * and no referral standing, it collapses to a single line that still opens
   * the form in one tap. Anything at all to say and the card returns in full.
   */
  const idle = !open && live.length === 0 && stale.length === 0 && !referral && changes.length === 0;

  if (idle) {
    return (
      <div className="soreness-idle">
        <span>Nothing reported sore.</span>
        <button className="text-button" type="button" onClick={() => setOpen(true)}>
          Something sore?
        </button>
      </div>
    );
  }

  return (
    <Card>
      <CardHead
        title="Something sore?"
        detail="Tell the app where and it changes today's plan — what comes out, what goes in, and whether you throw."
      />

      {referral && (
        <Alert tone="danger" role="alert">
          <strong>Get this one looked at.</strong>
          <p>{referral}</p>
          {onOpenShare && (
            <button className="text-button" type="button" onClick={onOpenShare}>
              Send your physio the link
            </button>
          )}
        </Alert>
      )}

      {/* A report that has aged out. Acting on it silently would be training
          around something that may have stopped hurting days ago, so the app
          asks rather than assumes. */}
      {stale.map((entry) => (
        <Alert tone="warn" key={`stale-${entry.report.region}`}>
          <strong>Is your {REGION_LABELS[entry.report.region].toLowerCase()} still sore?</strong>
          <p>
            You reported it {entry.daysRunning} days ago and it has not been mentioned since, so the
            plan is no longer being changed for it.
          </p>
          <span className="soreness-actions">
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setRegion(entry.report.region);
                setTrend("same");
                setOpen(true);
              }}
            >
              Still sore
            </button>
            <button className="text-button" type="button" onClick={() => onResolve(entry.report.region, date)}>
              It has gone
            </button>
          </span>
        </Alert>
      ))}

      {live.length > 0 && (
        <ul className="soreness-live">
          {live.map((entry) => (
            <li key={entry.report.region}>
              <div className="soreness-head">
                <strong>{REGION_LABELS[entry.report.region]}</strong>
                <span className={`soreness-tier tier-${entry.triage.tier}`}>
                  {TIER_LABELS[entry.triage.tier]}
                </span>
              </div>
              <p className="soreness-meta">
                {entry.report.severity}/10 · {QUALITY_LABELS[entry.report.quality].toLowerCase()} ·{" "}
                {TIMING_LABELS[entry.report.timing].toLowerCase()}
                {entry.daysRunning > 0 && ` · day ${entry.daysRunning + 1}`}
              </p>
              {entry.report.note && <p className="soreness-meta">“{entry.report.note}”</p>}
              {/* The reasoning, not just the verdict. Every rule that fired. */}
              <details className="soreness-why">
                <summary>Why</summary>
                <ul>
                  {entry.triage.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </details>
              <span className="soreness-actions">
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    setRegion(entry.report.region);
                    setTrend("same");
                    setOpen(true);
                  }}
                >
                  Update
                </button>
                <ConfirmButton
                  label="It has gone"
                  confirmLabel="Clear it?"
                  describe={`the ${REGION_LABELS[entry.report.region].toLowerCase()} report`}
                  className="text-button"
                  onConfirm={() => onResolve(entry.report.region, date)}
                />
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* What actually changed. Without this the plan simply looks different
          and the athlete is left to work out why. */}
      {changes.length > 0 && (
        <details className="soreness-changes">
          <summary>What changed in today&rsquo;s plan ({changes.length})</summary>
          <ul>
            {changes.map((change) => (
              <li key={`${change.kind}-${change.text}`}>
                <span className={`soreness-change ${change.kind}`}>{change.kind}</span> {change.text}
              </li>
            ))}
          </ul>
        </details>
      )}

      {!open && (
        <button className="btn btn-dark" type="button" onClick={() => setOpen(true)}>
          Report something sore
        </button>
      )}

      {open && (
        <div className="soreness-form">
          <fieldset>
            <legend>Where?</legend>
            <div className="soreness-grid">
              {offered.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`soreness-chip${region === option ? " selected" : ""}`}
                  aria-pressed={region === option}
                  onClick={() => setRegion(option)}
                >
                  <span>{REGION_LABELS[option]}</span>
                  {REGION_HINTS[option] && <small>{REGION_HINTS[option]}</small>}
                </button>
              ))}
            </div>
            {!showAllRegions && (
              <button className="text-button" type="button" onClick={() => setShowAllRegions(true)}>
                Somewhere else
              </button>
            )}
          </fieldset>

          <fieldset>
            <legend>
              How bad, out of 10? <strong>{severity}</strong>
            </legend>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={severity}
              aria-label="Severity out of 10"
              onChange={(event) => setSeverity(Number(event.target.value))}
            />
            <small>0 is nothing. 5 is the ceiling for training through it. 8 is hard to ignore.</small>
          </fieldset>

          <fieldset>
            <legend>What does it feel like?</legend>
            <div className="soreness-grid">
              {QUALITIES.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`soreness-chip${quality === option ? " selected" : ""}`}
                  aria-pressed={quality === option}
                  onClick={() => setQuality(option)}
                >
                  <span>{QUALITY_LABELS[option]}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>When do you notice it?</legend>
            <div className="soreness-grid">
              {TIMINGS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`soreness-chip${timing === option ? " selected" : ""}`}
                  aria-pressed={timing === option}
                  onClick={() => setTiming(option)}
                >
                  <span>{TIMING_LABELS[option]}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Since last time?</legend>
            <div className="soreness-grid">
              {TRENDS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`soreness-chip${trend === option ? " selected" : ""}`}
                  aria-pressed={trend === option}
                  onClick={() => setTrend(option)}
                >
                  <span>{TREND_LABELS[option]}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Anything else? (optional)</legend>
            <input
              type="text"
              value={note}
              maxLength={200}
              placeholder="Came on in the fourth, worse off the mound than flat ground"
              onChange={(event) => setNote(event.target.value)}
            />
          </fieldset>

          <div className="form-actions">
            <button className="btn btn-dark" type="button" disabled={!region} onClick={save}>
              {region ? `Save — ${REGION_LABELS[region].toLowerCase()}` : "Pick where it hurts"}
            </button>
            <button className="text-button" type="button" onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <p className="recovery-caveat">
        This changes your training. It does not diagnose anything, and it is not a substitute for your
        physio — it gets you through today safely and keeps a record they can read.
      </p>
    </Card>
  );
}
