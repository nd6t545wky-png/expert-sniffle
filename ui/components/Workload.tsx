import { formatIsoDate } from "../state/formatDate";
import { Pitch } from "../../src/domain/pitchLog";
import { PitchData } from "./PitchData";
import { MovementPlot } from "./MovementPlot";
import { GameLog } from "./GameLog";
import { Game } from "../../src/domain/gameLog";
import { useState } from "react";
import { IsoDate } from "../../src/domain/state";
import {
  PlanState,
  ThrowIntent,
  acuteChronicRatio,
  checkHighIntentAllowed,
  dayNameForDate,
  throwLoad,
  totalThrowLoad,
} from "../../src/domain/session";
import { Alert, Card, Field, Metric, PageHead } from "./Page";
import {
  ACWR_BAND,
  INTENT_PERCENT,
  LoggedOuting,
  acwrReading,
  restProblems,
} from "../../src/domain/recoveryProtocol";

/**
 * Throwing workload logging.
 *
 * The Wednesday/Saturday high-intent restriction is enforced through the
 * domain check on submit, not by hiding the option — so an attempt gets an
 * explanation rather than silently doing nothing.
 */

export interface ThrowingEntry {
  date: IsoDate;
  intent: ThrowIntent;
  throws: number;
}

export interface WorkloadProps {
  /** Ball-flight data for the open day. */
  pitches?: Pitch[];
  /** Every earlier day's pitches, for the movement comparison. */
  priorPitches?: Pitch[];
  /** Competition outings — see `src/domain/gameLog`. */
  games?: Game[];
  onSaveGame?: (game: Game) => void;
  onRemoveGame?: (id: string) => void;
  onImportPitches?: (pitches: Pitch[]) => void;
  onAddPitch?: (pitch: Pitch) => void;
  onRemovePitch?: (id: string) => void;
  date: IsoDate;
  plan: PlanState;
  entries: ThrowingEntry[];
  /** The athlete's own reading of the intent words. Defaults to the table. */
  intentPercent?: Record<string, number>;
  onLog: (entry: ThrowingEntry) => void;
}

/** Wording, not the raw enum — the original never showed a stored key. */
const INTENTS: { value: ThrowIntent; label: string }[] = [
  { value: "recovery", label: "Recovery — catch play" },
  { value: "low", label: "Low intent" },
  { value: "moderate", label: "Moderate intent" },
  { value: "high", label: "High intent / game" },
];

export function Workload({
  date,
  plan,
  entries,
  intentPercent = INTENT_PERCENT,
  onLog,
  pitches,
  priorPitches,
  games,
  onSaveGame,
  onRemoveGame,
  onImportPitches,
  onAddPitch,
  onRemovePitch,
}: WorkloadProps) {
  const [intent, setIntent] = useState<ThrowIntent>("low");
  const [throws, setThrows] = useState(20);
  const [error, setError] = useState("");

  const day = dayNameForDate(date);
  const last7 = totalThrowLoad(entries.slice(-7));
  const last28 = totalThrowLoad(entries.slice(-28));
  const ratio = acuteChronicRatio(last7, last28);
  // The protocol asks for the ratio to be banded at 0.8–1.3 and shown, never
  // gated on: the meta-analysis behind the band warns of heterogeneity and
  // inconsistent calculation in the same breath as recommending it.
  const banded = acwrReading(last7, last28 / 4);

  // What the log already shows about rest taken. Retrospective, because the
  // app has no planned next outing to check against.
  const rest = restProblems([
    ...entries.map((entry) => ({
      date: entry.date,
      load: { totalThrows: entry.throws, intentPercent: intentPercent[entry.intent] ?? null },
    })),
    ...(games ?? []).map((game) => ({
      date: game.date,
      load: { gamePitches: game.pitches, competitiveStart: true },
    })),
  ] as LoggedOuting[]);

  function handleLog() {
    setError("");
    const check = checkHighIntentAllowed(date, intent, plan);
    if (!check.allowed) {
      setError(check.message);
      return;
    }
    onLog({ date, intent, throws });
  }

  return (
    <>
      <PageHead
        eyebrow="Throwing workload"
        title="Log today's throwing."
        intro={formatIsoDate(date)}
      />

      <Card>
        <div className="form-grid">
          <Field id="intent" label="Intent">
            <select id="intent" value={intent} onChange={(event) => setIntent(event.target.value as ThrowIntent)}>
              {INTENTS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <Field id="throws" label="Throws" hint={`Scores ${throwLoad({ intent, throws })} weighted load`}>
            <input
              id="throws"
              type="number"
              min={0}
              max={300}
              value={throws}
              onChange={(event) => setThrows(Number(event.target.value))}
            />
          </Field>

          <div className="form-actions">
            <button type="button" className="btn btn-dark" onClick={handleLog}>
              Log throwing
            </button>
          </div>
        </div>
      </Card>

      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}

      <section className="grid metrics">
        <Metric label="7-day load" value={last7 || "—"} detail="Weighted by intent" source="Logged throwing" />
        <Metric label="28-day load" value={last28 || "—"} detail="Rolling month" source="Logged throwing" />
        {/* No risk colouring on this tile. The acute:chronic ratio is widely
            used but its statistical properties have been shown to make it an
            unreliable injury predictor (Impellizzeri et al., 2020), and
            painting it red or green asserts a threshold the evidence does not
            support. It is shown as a descriptive trend and labelled as one. */}
        <Metric
          label="Acute : chronic"
          value={ratio === null ? "—" : ratio}
          detail={
            ratio === null
              ? "Not enough history"
              : `${banded?.inBand ? "In" : "Outside"} the ${ACWR_BAND[0]}–${ACWR_BAND[1]} band · 7-day vs average week — a trend, not a risk score`
          }
        />
      </section>

      {rest.length > 0 && (
        <Alert tone="warn">
          <strong>Rest taken</strong>
          {rest.map((problem) => (
            <p key={problem}>{problem}</p>
          ))}
        </Alert>
      )}

      <p className="fineprint">
        <strong>On this ratio:</strong> the acute:chronic workload ratio describes how this week
        compares with your recent average. It is not an injury-risk model — its statistical
        properties make it unreliable as a predictor, and no threshold here is safe or unsafe.
        Rising load with rising soreness is worth a conversation with your coach; the number on its
        own is not a verdict.
      </p>

      {onImportPitches && onAddPitch && onRemovePitch && (
        <PitchData
          date={date}
          pitches={pitches ?? []}
          onImport={onImportPitches}
          onAdd={onAddPitch}
          onRemove={onRemovePitch}
        />
      )}

      <MovementPlot pitches={pitches ?? []} priorPitches={priorPitches ?? []} />

      {/* The training exists to serve outings, so the outings belong on the
          same page as the throwing that builds toward them. */}
      {onSaveGame && onRemoveGame && (
        <GameLog date={date} games={games ?? []} onSave={onSaveGame} onRemove={onRemoveGame} />
      )}
    </>
  );
}
