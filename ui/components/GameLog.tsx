import { useState } from "react";
import { IsoDate } from "../../src/domain/state";
import {
  Game,
  GameSide,
  appearance,
  gameProblems,
  outsFromInnings,
  seasonFindings,
  seasonRates,
  seasonTotals,
} from "../../src/domain/gameLog";
import { Alert, Card, CardHead, EmptyState, Field } from "./Page";
import { ConfirmButton } from "./ConfirmButton";
import { formatIsoDate } from "../state/formatDate";

/**
 * The scorebook line, and what a season of them says.
 *
 * The app tracked throwing *load* and nothing about competition — no opponent,
 * no innings, no pitch count, no result. For a pitcher in a season that was
 * the largest hole in the whole thing: the training exists to serve outings,
 * and the outings were invisible.
 *
 * The form asks for what a pitcher already writes down after a game, in the
 * order they would write it, and adds the two numbers that predict more than
 * any other and that nothing else here could produce: strike rate and
 * first-pitch strikes.
 *
 * A line that contradicts itself is refused rather than stored. More strikes
 * than pitches poisons every rate that touches it, and there is no way to
 * notice afterwards.
 */

export interface GameLogProps {
  date: IsoDate;
  games: Game[];
  onSave: (game: Game) => void;
  onRemove: (id: string) => void;
}

interface Draft {
  date: string;
  opponent: string;
  side: GameSide;
  innings: string;
  battersFaced: string;
  pitches: string;
  strikes: string;
  firstPitchStrikes: string;
  hits: string;
  runs: string;
  earnedRuns: string;
  walks: string;
  strikeouts: string;
  hitBatters: string;
  notes: string;
}

function blank(date: IsoDate): Draft {
  return {
    date,
    opponent: "",
    side: "home",
    innings: "",
    battersFaced: "",
    pitches: "",
    strikes: "",
    firstPitchStrikes: "",
    hits: "",
    runs: "",
    earnedRuns: "",
    walks: "",
    strikeouts: "",
    hitBatters: "",
    notes: "",
  };
}

function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const n = (value: string) => Math.max(0, Math.floor(Number(value) || 0));

/** The counting stats, in the order a scorebook line reads. */
const COUNTS: { key: keyof Draft; label: string; hint?: string }[] = [
  { key: "battersFaced", label: "Batters faced" },
  { key: "pitches", label: "Pitches" },
  { key: "strikes", label: "Strikes" },
  { key: "firstPitchStrikes", label: "First-pitch strikes", hint: "Batters whose first pitch was a strike" },
  { key: "hits", label: "Hits" },
  { key: "runs", label: "Runs" },
  { key: "earnedRuns", label: "Earned runs" },
  { key: "walks", label: "Walks" },
  { key: "strikeouts", label: "Strikeouts" },
  { key: "hitBatters", label: "Hit batters" },
];

export function GameLog({ date, games, onSave, onRemove }: GameLogProps) {
  const [draft, setDraft] = useState<Draft>(() => blank(date));
  const [problems, setProblems] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  const totals = seasonTotals(games);
  const rates = seasonRates(totals);
  const findings = seasonFindings(totals, rates);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();

    const outs = outsFromInnings(draft.innings);
    if (outs === null) {
      setProblems([
        'Innings must be written as the scorebook does — "5" for five, "3.2" for three and two outs.',
      ]);
      return;
    }

    const game: Game = {
      id: newId(),
      date: draft.date,
      opponent: draft.opponent.trim(),
      side: draft.side,
      outs,
      battersFaced: n(draft.battersFaced),
      pitches: n(draft.pitches),
      strikes: n(draft.strikes),
      firstPitchStrikes: n(draft.firstPitchStrikes),
      hits: n(draft.hits),
      runs: n(draft.runs),
      earnedRuns: n(draft.earnedRuns),
      walks: n(draft.walks),
      strikeouts: n(draft.strikeouts),
      hitBatters: n(draft.hitBatters),
      ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
    };

    const found = gameProblems(game);
    if (found.length) {
      setProblems(found);
      return;
    }

    onSave(game);
    setDraft(blank(date));
    setProblems([]);
    setOpen(false);
  }

  return (
    <>
      <Card>
        <CardHead
          title="Season"
          detail={
            totals.games === 0
              ? "Once you log a game"
              : `${totals.games} ${totals.games === 1 ? "game" : "games"} · ${totals.innings} innings`
          }
        />

        {totals.games === 0 ? (
          <EmptyState
            title="No games logged yet"
            detail="Add an outing below and the season line builds itself."
          />
        ) : (
          <>
            <ul className="rate-grid">
              {rates.map((rate) => (
                <li key={rate.id} className={rate.thin ? "is-thin" : ""}>
                  <strong>{rate.display}</strong>
                  <span>{rate.label}</span>
                  <small>{rate.why}</small>
                </li>
              ))}
            </ul>

            <p className="fineprint">
              {totals.pitches} pitches, {totals.strikes} strikes, {totals.battersFaced} batters
              faced, {totals.strikeouts} strikeouts, {totals.walks} walks, {totals.hits} hits,{" "}
              {totals.earnedRuns} earned.
            </p>

            {findings.map((finding) => (
              <Alert key={finding.text} tone={finding.severity === "watch" ? "warn" : "info"}>
                {finding.text}
              </Alert>
            ))}
          </>
        )}
      </Card>

      <Card>
        <CardHead title="Game log" detail="One line per outing" />

        {games.length === 0 ? null : (
          <div className="scroll-x">
            <table className="pitch-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Opponent</th>
                  <th scope="col">IP</th>
                  <th scope="col">P</th>
                  <th scope="col">Strike%</th>
                  <th scope="col">1st-P</th>
                  <th scope="col">K</th>
                  <th scope="col">BB</th>
                  <th scope="col">ER</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {games.map((game) => {
                  const line = appearance(game);
                  return (
                    <tr key={game.id}>
                      <td>{formatIsoDate(game.date, { day: "numeric", month: "short" })}</td>
                      <td>
                        {game.side === "home" ? "vs " : "@ "}
                        {game.opponent}
                      </td>
                      <td>{line.innings}</td>
                      <td>{game.pitches}</td>
                      <td>{line.strikePct === null ? "—" : `${line.strikePct.toFixed(0)}%`}</td>
                      <td>
                        {line.firstPitchStrikePct === null
                          ? "—"
                          : `${line.firstPitchStrikePct.toFixed(0)}%`}
                      </td>
                      <td>{game.strikeouts}</td>
                      <td>{game.walks}</td>
                      <td>{game.earnedRuns}</td>
                      <td>
                        <ConfirmButton
                          label="Remove"
                          describe={`the game against ${game.opponent} on ${game.date}`}
                          onConfirm={() => onRemove(game.id)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!open ? (
          <div className="form-actions">
            <button className="btn btn-dark" type="button" onClick={() => setOpen(true)}>
              Log a game
            </button>
          </div>
        ) : (
          <form className="form-grid" onSubmit={submit}>
            <Field id="gameDate" label="Date">
              <input
                id="gameDate"
                type="date"
                value={draft.date}
                onChange={(event) => set("date", event.target.value)}
              />
            </Field>

            <Field id="gameOpponent" label="Opponent">
              <input
                id="gameOpponent"
                type="text"
                placeholder="Coomera Cubs"
                value={draft.opponent}
                onChange={(event) => set("opponent", event.target.value)}
              />
            </Field>

            <Field id="gameSide" label="Home or away">
              <select
                id="gameSide"
                value={draft.side}
                onChange={(event) => set("side", event.target.value as GameSide)}
              >
                <option value="home">Home</option>
                <option value="away">Away</option>
              </select>
            </Field>

            <Field id="gameInnings" label="Innings pitched">
              <input
                id="gameInnings"
                type="text"
                inputMode="decimal"
                placeholder="3.2"
                value={draft.innings}
                onChange={(event) => set("innings", event.target.value)}
              />
              {/* The scorebook's own notation, because that is what the athlete
                  has in front of them — and because ".3" is not a third of an
                  inning, it is the next one. */}
              <small>As the scorebook writes it: 5 for five, 3.2 for three and two outs</small>
            </Field>

            {COUNTS.map((count) => (
              <Field key={count.key} id={`game-${count.key}`} label={count.label}>
                <input
                  id={`game-${count.key}`}
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={draft[count.key] as string}
                  onChange={(event) => set(count.key, event.target.value as Draft[typeof count.key])}
                />
                {count.hint && <small>{count.hint}</small>}
              </Field>
            ))}

            <Field id="gameNotes" label="Notes" full>
              <textarea
                id="gameNotes"
                placeholder="Command, what worked, what the catcher said…"
                value={draft.notes}
                onChange={(event) => set("notes", event.target.value)}
              />
            </Field>

            {problems.length > 0 && (
              <Alert tone="danger" role="alert">
                <strong>This line does not add up</strong>
                {problems.map((problem) => (
                  <span key={problem} className="backup-issue">
                    {problem}
                  </span>
                ))}
              </Alert>
            )}

            <div className="form-actions">
              <button className="btn btn-dark" type="submit">
                Save game
              </button>
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => {
                  setOpen(false);
                  setProblems([]);
                  setDraft(blank(date));
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <p className="fineprint">
          Strike rate and first-pitch strikes are the two command numbers worth chasing — being
          around the zone, and getting ahead. Neither can be worked out from a pitch count, which is
          why they are asked for here.
        </p>
      </Card>
    </>
  );
}
