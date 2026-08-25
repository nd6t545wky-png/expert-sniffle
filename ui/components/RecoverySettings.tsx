/**
 * The two things the recovery protocol assumes about this athlete.
 *
 * Both were constants in the source. That was fine while one person used the
 * app and nothing changed — and wrong the first time either did. A gun that
 * breaks, a set of cups lent out or a sleeve bought next month all leave the
 * plan prescribing work the athlete cannot do, or hiding work they now can;
 * and the intent words mean different efforts to different throwers, which
 * decides whether a session triggers a five-day protocol at all.
 *
 * So both live in the workspace, and both are edited here. Neither is a
 * measurement, and the copy says so rather than implying a precision the
 * numbers do not have.
 */

import {
  EQUIPMENT_LABELS,
  INTENT_PERCENT,
  INTENT_PERCENT_RANGE,
  RecoveryEquipment,
  TRIGGER,
} from "../../src/domain/recoveryProtocol";
import { TeamTraining, WEEKDAY_LABELS } from "../../src/domain/teamTraining";
import { Card, CardHead } from "./Page";

const EQUIPMENT_IDS = Object.keys(EQUIPMENT_LABELS) as RecoveryEquipment[];

const INTENT_WORDS = Object.keys(INTENT_PERCENT);

const INTENT_HINT: Record<string, string> = {
  recovery: "Catch play, no effort behind it.",
  low: "Flat ground, working on shape.",
  moderate: "Bullpen at working effort.",
  high: "Everything, or close to it.",
};

export interface RecoverySettingsProps {
  equipment: readonly RecoveryEquipment[];
  intentPercent: Record<string, number>;
  teamTraining: TeamTraining;
  onEquipment: (next: RecoveryEquipment[]) => void;
  onIntentPercent: (next: Record<string, number>) => void;
  onTeamTraining: (next: TeamTraining) => void;
}

export function RecoverySettings({
  equipment,
  intentPercent,
  teamTraining,
  onEquipment,
  onIntentPercent,
  onTeamTraining,
}: RecoverySettingsProps) {
  const owned = new Set(equipment);
  const [floor, ceiling] = INTENT_PERCENT_RANGE;

  const nights = new Set(teamTraining.days);

  return (
    <>
      {/* Club training is the one thing on this page that changes the session
          itself rather than how it is interpreted, so it goes first. */}
      <Card>
        <CardHead
          title="Club training nights"
          detail="On a training night, practice throwing replaces the solo set rather than being added on top of it."
        />
        <ul className="kit-list">
          {WEEKDAY_LABELS.map((label, day) => (
            <li key={label}>
              <label>
                <input
                  type="checkbox"
                  checked={nights.has(day)}
                  onChange={(event) =>
                    onTeamTraining({
                      ...teamTraining,
                      days: event.target.checked
                        ? [...teamTraining.days, day].sort((a, b) => a - b)
                        : teamTraining.days.filter((value) => value !== day),
                    })
                  }
                />
                <span>{label}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="intent-grid">
          <div className="field">
            <label htmlFor="team-club">Club</label>
            <input
              id="team-club"
              type="text"
              maxLength={40}
              value={teamTraining.club}
              onChange={(event) => onTeamTraining({ ...teamTraining, club: event.target.value })}
            />
            <small>Named on the day, so the plan says whose session it is.</small>
          </div>
          <div className="field">
            <label htmlFor="team-from">Training started</label>
            <input
              id="team-from"
              type="date"
              value={teamTraining.from}
              onChange={(event) =>
                onTeamTraining({ ...teamTraining, from: (event.target.value || teamTraining.from) as TeamTraining["from"] })
              }
            />
            <small>Days before this keep the plan as it was written, so past weeks stay honest.</small>
          </div>
        </div>
        <p className="recovery-caveat">
          The summer weeks were written around club practice already and are left alone — this only
          changes days the programme thought you were training on your own.
        </p>
      </Card>

      <Card>
        <CardHead
          title="Recovery kit"
          detail="Work that needs equipment you do not have is left out of the plan, not greyed out."
        />
        <ul className="kit-list">
          {EQUIPMENT_IDS.map((id) => (
            <li key={id}>
              <label>
                <input
                  type="checkbox"
                  checked={owned.has(id)}
                  onChange={(event) =>
                    onEquipment(
                      event.target.checked
                        ? [...EQUIPMENT_IDS.filter((item) => owned.has(item) || item === id)]
                        : EQUIPMENT_IDS.filter((item) => owned.has(item) && item !== id)
                    )
                  }
                />
                <span>{EQUIPMENT_LABELS[id]}</span>
              </label>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHead
          title="What your intent words mean"
          detail={`The log records a word; the protocol works in percent. ${TRIGGER.intentPercent}% or more over ${TRIGGER.totalThrows} throws starts a recovery protocol.`}
        />
        <div className="intent-grid">
          {INTENT_WORDS.map((word) => (
            <div className="field" key={word}>
              <label htmlFor={`intent-${word}`}>{word}</label>
              <input
                id={`intent-${word}`}
                type="number"
                min={floor}
                max={ceiling}
                inputMode="numeric"
                value={intentPercent[word] ?? INTENT_PERCENT[word]}
                onChange={(event) =>
                  onIntentPercent({ ...intentPercent, [word]: Number(event.target.value) })
                }
              />
              <small>{INTENT_HINT[word]}</small>
            </div>
          ))}
        </div>
        <p className="recovery-caveat">
          These are your own reading of the words, not measurements. Values are held between {floor}%
          and {ceiling}% so an edit cannot switch the protocol off by accident.
        </p>
      </Card>
    </>
  );
}
