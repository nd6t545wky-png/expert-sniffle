/**
 * The four numbers every prescribed load in the year is a percentage of.
 *
 * They were not editable, and one of them was not even set. The trap bar had a
 * periodised table for all fifty-two weeks and no max behind it, so every trap
 * bar session in the plan fell back to "@ RPE 6" — which reads as a deliberate
 * RPE prescription rather than as a number the app could not compute.
 *
 * Editable, then, and honest about provenance: a tested max, a max derived
 * from the programme's own arithmetic and a max the athlete typed are three
 * different kinds of fact, and the one the plan is currently using says which
 * it is. Clearing a max is a real option, not an omission — it puts the lift
 * back on the programme's written fallback, which is the right answer for a
 * lift nobody has tested.
 */

import { useState } from "react";
import {
  MAXED_LIFTS,
  MAX_KIND_LABEL,
  MAX_RANGE,
  TrainingMax,
  isUsableMax,
} from "../../src/domain/trainingMaxes";
import { Card, CardHead } from "./Page";

export interface TrainingMaxesProps {
  maxes: Record<string, TrainingMax>;
  onChange: (key: string, value: number | null) => void;
}

export function TrainingMaxes({ maxes, onChange }: TrainingMaxesProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const draftFor = (key: string) =>
    drafts[key] ?? (maxes[key] ? String(maxes[key].value) : "");

  function save(key: string) {
    const raw = draftFor(key).trim();
    if (!raw) {
      setError("");
      onChange(key, null);
      setDrafts((current) => ({ ...current, [key]: "" }));
      return;
    }
    const value = Number(raw);
    if (!isUsableMax(value)) {
      setError(`A training max has to be between ${MAX_RANGE[0]} and ${MAX_RANGE[1]} kg. ${raw} kg is not one — nothing was changed.`);
      return;
    }
    setError("");
    onChange(key, value);
  }

  return (
    <Card>
      <CardHead
        title="Training maxes"
        detail="Every prescribed load in the plan is a percentage of one of these. A lift with no max falls back to whatever the programme wrote by hand, which is usually an RPE cap — so an empty box here is why a session says “@ RPE 6” instead of a weight."
      />

      {error && (
        <p className="recovery-caveat" role="alert">
          {error}
        </p>
      )}

      <ul className="fixture-entries">
        {MAXED_LIFTS.map((lift) => {
          const stored = maxes[lift.key];
          return (
            <li key={lift.key}>
              <div>
                <strong>{lift.name}</strong>
                <small>
                  {stored
                    ? `${stored.value} kg · ${MAX_KIND_LABEL[stored.kind]}${stored.source ? ` — ${stored.source}` : ""}`
                    : "No max — this lift is running on the written fallback."}
                </small>
                <small>{lift.drives}</small>
              </div>
              <div className="field">
                <label htmlFor={`max-${lift.key}`}>kg</label>
                <input
                  id={`max-${lift.key}`}
                  type="number"
                  min={MAX_RANGE[0]}
                  max={MAX_RANGE[1]}
                  step={2.5}
                  inputMode="decimal"
                  value={draftFor(lift.key)}
                  placeholder="—"
                  onChange={(event) =>
                    setDrafts((current) => ({ ...current, [lift.key]: event.target.value }))
                  }
                  onBlur={() => save(lift.key)}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <p className="fineprint">
        A number you type is recorded as yours and outranks anything derived. Clear the box to put
        that lift back on the programme's written prescription.
      </p>
    </Card>
  );
}
