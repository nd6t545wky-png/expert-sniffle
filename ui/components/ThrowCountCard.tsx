/**
 * The day's throw count, on the screen where the throwing is ticked off.
 *
 * It used to live only on the Workload tab, which meant the athlete finished a
 * session, worked out the total in their head, went to another page and typed
 * it in — and the number that fed the acute:chronic ratio was whichever of the
 * two records they remembered to keep. Ticking the throwing tasks now produces
 * the count, and this shows it, with its working, beside the ticking.
 *
 * The edit is the point of the card as much as the number is. A count read off
 * the prescription is a floor: the prescription says "45–60 total throws" and
 * this reads 45, so a day that actually ran long is always a correction
 * upward, made in one place, in the moment, rather than a trip to another tab
 * that mostly does not happen.
 *
 * Once edited, the day is the athlete's. The automatic figure keeps being
 * shown so they can see what the session said and take it back if they want,
 * but nothing here will overwrite a number a person typed.
 */

import { useEffect, useState } from "react";
import { ThrowTally, ThrowingRecord } from "../../src/domain/throwCount";
import { ThrowIntent } from "../../src/domain/session";
import { Card } from "./Page";

/** Wording, not the stored key — the same list the Workload tab offers. */
const INTENTS: { value: ThrowIntent; label: string }[] = [
  { value: "recovery", label: "Recovery — catch play" },
  { value: "low", label: "Low intent" },
  { value: "moderate", label: "Moderate intent" },
  { value: "high", label: "High intent / game" },
];

const INTENT_LABEL: Record<ThrowIntent, string> = {
  recovery: "recovery",
  low: "low intent",
  moderate: "moderate intent",
  high: "high intent",
};

export interface ThrowCountCardProps {
  /** What the completed throwing tasks and logged games add up to. */
  tally: ThrowTally | null;
  /** What is stored for the day, whoever put it there. */
  entry: ThrowingRecord | null;
  onSave: (entry: { throws: number; intent: ThrowIntent }) => void;
  /** Drop back to the automatic count. */
  onUseAuto: () => void;
}

export function ThrowCountCard({ tally, entry, onSave, onUseAuto }: ThrowCountCardProps) {
  const edited = entry?.source === "manual" || (entry != null && entry.source == null);
  const shown = entry?.throws ?? tally?.throws ?? 0;
  const intent = entry?.intent ?? tally?.intent ?? "low";

  const [open, setOpen] = useState(false);
  const [throws, setThrows] = useState(String(shown));
  const [chosen, setChosen] = useState<ThrowIntent>(intent);

  // Reopening on a different day, or after the tally moves underneath it, has
  // to start from what the day now says rather than from the last day's draft.
  useEffect(() => {
    if (!open) {
      setThrows(String(shown));
      setChosen(intent);
    }
  }, [open, shown, intent]);

  if (!tally && !entry) return null;

  const differs = edited && tally != null && tally.throws !== entry?.throws;

  return (
    <Card>
      <div className="card-head">
        <div>
          <h3>Throws today</h3>
          <p>
            {edited ? "Your count" : "From the session, as you tick it"} ·{" "}
            {INTENT_LABEL[intent]}
          </p>
        </div>
        <strong>{shown}</strong>
      </div>

      {!open && (
        <>
          {tally && tally.sources.length > 0 && (
            <ul className="mini-list throw-sources">
              {tally.sources.map((source) => (
                <li key={source.id}>
                  <span>{source.name}</span>
                  <span>{source.throws}</span>
                </li>
              ))}
            </ul>
          )}

          {tally && tally.unread.length > 0 && (
            <p className="fineprint">
              {tally.unread.join(", ")} {tally.unread.length === 1 ? "states" : "state"} no throw
              count, so {tally.unread.length === 1 ? "it is" : "they are"} not in this total. Add
              what you actually threw.
            </p>
          )}

          {differs && (
            <p className="fineprint">
              The session adds up to {tally!.throws}. You recorded {entry!.throws}.
            </p>
          )}

          <div className="setlog-actions">
            <button className="text-button" type="button" onClick={() => setOpen(true)}>
              {edited ? "Edit count" : "Threw more than this?"}
            </button>
            {differs && (
              <button className="text-button" type="button" onClick={onUseAuto}>
                Use {tally!.throws}
              </button>
            )}
          </div>
        </>
      )}

      {open && (
        <form
          className="setlog"
          onSubmit={(event) => {
            event.preventDefault();
            const value = Number(throws);
            if (!Number.isFinite(value) || value < 0) return;
            onSave({ throws: Math.round(value), intent: chosen });
            setOpen(false);
          }}
        >
          <label className="field">
            <span>Throws</span>
            <input
              type="number"
              min={0}
              max={400}
              inputMode="numeric"
              value={throws}
              onChange={(event) => setThrows(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Hardest intent reached</span>
            <select value={chosen} onChange={(event) => setChosen(event.target.value as ThrowIntent)}>
              {INTENTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="setlog-actions">
            <button className="btn btn-outline" type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-dark" type="submit">
              Save count
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}
