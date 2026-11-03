import { useState } from "react";
import {
  FIELD,
  HittingGame,
  PlateAppearance,
  QAB_TAPS,
  RESULT_GROUPS,
  SITUATION_TAPS,
  TapKey,
  avgFormat,

  fieldZone,
  gameLine,
  hitStats,
  inPlay,
  isBunt,
  pctFormat,
  qabReasons,
  resultLabel,
  tendency,
} from "../../src/domain/hitting";
import { BattingLine, battingTotals } from "../../src/domain/ballclubz";
import { IsoDate } from "../../src/domain/state";
import { formatIsoDate } from "../state/formatDate";
import { Card, CardHead, EmptyState } from "./Page";

/**
 * At-bat tracking, ported from the BQ Weekly app: one game per date, each
 * at-bat entered as a result plus what went with it, and the season read off
 * the at-bats. The official GBL line from Ballclubz sits beside it.
 */

const HIT_CODES = new Set(["1B", "2B", "3B", "HR", "BH"]);
const dotColour = (res: string) =>
  HIT_CODES.has(res) ? "var(--hit-dot)" : res === "ROE" ? "var(--error-dot)" : "var(--out-dot)";

/** The field, to scale - the BQ app's drawing. Tappable when `onTap` is given. */
export function Field({
  dots,
  onTap,
  label = "Baseball field",
}: {
  dots: readonly { x: number; y: number; colour: string; r?: number }[];
  onTap?: (x: number, y: number) => void;
  label?: string;
}) {
  const { w, h, hx, hy, r } = FIELD;
  const ft = r / 330;
  const a = Math.PI / 4;
  const lx = hx - r * Math.sin(a);
  const ly = hy - r * Math.cos(a);
  const rx = hx + r * Math.sin(a);
  const bp = 90 * ft * Math.SQRT1_2;
  const bases: [number, number][] = [
    [hx + bp, hy - bp],
    [hx, hy - 2 * bp],
    [hx - bp, hy - bp],
  ];
  const mound: [number, number] = [hx, hy - 60.5 * ft];
  const fair = `M${hx},${hy} L${lx},${ly} A${r},${r} 0 0 1 ${rx},${ly} Z`;
  const centre: [number, number] = [hx, hy - bp];
  const pull = ([x, y]: [number, number], k: number) => [x + (centre[0] - x) * k, y + (centre[1] - y) * k];
  const grass = [pull([hx, hy], 0.3), pull(bases[0], 0.18), pull(bases[1], 0.18), pull(bases[2], 0.18)];
  const clip = `fair-${onTap ? "entry" : "chart"}`;

  return (
    <svg
      className={`hit-field${onTap ? " tappable" : ""}`}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={label}
      onClick={
        onTap
          ? (event) => {
              const box = event.currentTarget.getBoundingClientRect();
              onTap(
                Math.round(((event.clientX - box.left) / box.width) * 1000) / 1000,
                Math.round(((event.clientY - box.top) / box.height) * 1000) / 1000
              );
            }
          : undefined
      }
    >
      <defs>
        <clipPath id={clip}>
          <path d={fair} />
        </clipPath>
      </defs>
      <path className="grass" d={fair} />
      <g clipPath={`url(#${clip})`}>
        <circle className="dirt" cx={mound[0]} cy={mound[1]} r={95 * ft} />
        <path className="grass" d={`M${grass.map((p) => p.join(",")).join(" L")} Z`} />
      </g>
      <circle className="dirt" cx={mound[0]} cy={mound[1]} r={9 * ft} />
      <circle className="dirt" cx={hx} cy={hy} r={13 * ft} />
      <path className="line" d={`M${lx},${ly} L${hx},${hy} L${rx},${ly}`} />
      {bases.map(([x, y]) => (
        <rect key={`${x}-${y}`} className="base" x={x - 3.5} y={y - 3.5} width={7} height={7} transform={`rotate(45 ${x} ${y})`} />
      ))}
      <path className="base" d={`M${hx - 3.5},${hy - 3} h7 v3 l-3.5,3 l-3.5,-3 z`} />
      {(
        [
          ["LF", -36, 170],
          ["LC", -18, 182],
          ["CF", 0, 188],
          ["RC", 18, 182],
          ["RF", 36, 170],
        ] as const
      ).map(([text, angle, distance]) => (
        <text
          key={text}
          className="lbl"
          textAnchor="middle"
          x={hx + distance * Math.sin((angle * Math.PI) / 180)}
          y={hy - distance * Math.cos((angle * Math.PI) / 180)}
        >
          {text}
        </text>
      ))}
      {dots.map((dot, index) => (
        <circle key={index} cx={dot.x * w} cy={dot.y * h} r={dot.r ?? 6} fill={dot.colour} className="field-dot" />
      ))}
    </svg>
  );
}

interface Draft {
  res: string | null;
  hh: 0 | 1 | null;
  rbi: number;
  x: number | null;
  y: number | null;
  zone: string | null;
  taps: Partial<Record<TapKey, 1>>;
}

const emptyDraft = (): Draft => ({ res: null, hh: null, rbi: 0, x: null, y: null, zone: null, taps: {} });

function toPlateAppearance(draft: Draft): PlateAppearance {
  const pa: PlateAppearance = { res: draft.res as string, rbi: draft.rbi };
  if (draft.hh !== null && !isBunt(draft.res)) pa.hh = draft.hh;
  for (const [key, value] of Object.entries(draft.taps)) if (value) (pa as unknown as Record<string, number>)[key] = 1;
  if (inPlay(draft.res) && draft.x !== null && draft.y !== null) {
    pa.x = draft.x;
    pa.y = draft.y;
    pa.zone = draft.zone ?? undefined;
  }
  return pa;
}

function AtBatList({ pas, onRemove }: { pas: readonly PlateAppearance[]; onRemove?: (index: number) => void }) {
  const [arming, setArming] = useState<number | null>(null);
  return (
    <ol className="atbat-list">
      {pas.map((pa, index) => {
        const extras = [
          pa.rbi ? `${pa.rbi} RBI` : "",
          ...[...SITUATION_TAPS, ...QAB_TAPS].filter(([key]) => pa[key]).map(([, label]) => label),
        ].filter(Boolean);
        return (
          <li key={index}>
            <div>
              <strong>{index + 1}.</strong> {qabReasons(pa).length ? <span className="qab-badge">QAB ✓</span> : null}
              {resultLabel(pa.res)}
              {pa.hh === 1 ? " · 👍 hard hit" : pa.hh === 0 ? " · 👎" : ""}
              {pa.zone ? ` · ${pa.zone}` : ""}
              {extras.length > 0 && <small>{extras.join(" · ")}</small>}
            </div>
            {onRemove && (
              <button
                className="text-button danger-text"
                type="button"
                onClick={() => {
                  if (arming === index) {
                    onRemove(index);
                    setArming(null);
                  } else setArming(index);
                }}
              >
                {arming === index ? "Tap again" : "Remove"}
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function StatTiles({ pas }: { pas: readonly PlateAppearance[] }) {
  const t = hitStats(pas);
  const tiles: [string, string][] = [
    ["QAB %", pctFormat(t.qabp)],
    ["Hard-hit %", pctFormat(t.hardp)],
    ["AVG", avgFormat(t.avg)],
    ["OBP", avgFormat(t.obp)],
    ["SLG", avgFormat(t.slg)],
    ["OPS", avgFormat(t.ops)],
    ["PA", String(t.pa)],
    ["K%", pctFormat(t.kp)],
    ["BB%", pctFormat(t.bbp)],
  ];
  return (
    <>
      <div className="hit-tiles">
        {tiles.map(([label, value]) => (
          <div key={label}>
            <strong>{value}</strong>
            <small>{label}</small>
          </div>
        ))}
      </div>
      <p className="fineprint">
        {t.h} H · {t.xbh} XBH · {t.rbi} RBI · {t.bunt} bunt{t.bunt === 1 ? "" : "s"} · {t.r3} runner{t.r3 === 1 ? "" : "s"} scored from 3rd
      </p>
    </>
  );
}

export interface HittingProps {
  date: IsoDate;
  games: readonly HittingGame[];
  bats?: string;
  onSaveGame: (game: HittingGame) => void;
  leagueBatting?: readonly BattingLine[];
}

export function Hitting({ date: initialDate, games, bats, onSaveGame, leagueBatting = [] }: HittingProps) {
  const [date, setDate] = useState<IsoDate>(initialDate);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [showOpp, setShowOpp] = useState(false);
  const game = games.find((candidate) => candidate.date === date) ?? { date, pas: [] };
  const allPas = games.flatMap((candidate) => candidate.pas);
  const tendencyLines = tendency(games, bats);

  const save = (next: Partial<HittingGame>) => onSaveGame({ ...game, ...next, date, updatedAt: new Date().toISOString() });

  const pick = (res: string) =>
    setDraft((current) => ({
      ...current,
      res,
      hh: isBunt(res) ? null : current.hh,
      ...(inPlay(res) ? {} : { x: null, y: null, zone: null }),
    }));
  const toggle = (key: TapKey) =>
    setDraft((current) => ({ ...current, taps: { ...current.taps, [key]: current.taps[key] ? undefined : 1 } }));

  const preview = draft.res ? qabReasons(toPlateAppearance(draft)) : [];
  const league = leagueBatting.length ? battingTotals(leagueBatting) : null;

  return (
    <>
      <Card aria-label="Game">
        <div className="form-grid">
          <div className="field">
            <label htmlFor="hitDate">Game date</label>
            <input id="hitDate" type="date" value={date} onChange={(event) => event.target.value && setDate(event.target.value as IsoDate)} />
          </div>
          {showOpp || game.opp ? (
            <div className="field">
              <label htmlFor="hitOpp">Opponent</label>
              <input
                id="hitOpp"
                type="text"
                maxLength={60}
                placeholder="e.g. Redcliffe Padres"
                defaultValue={game.opp ?? ""}
                key={`opp-${date}`}
                onBlur={(event) => save({ opp: event.target.value.trim() || undefined })}
              />
            </div>
          ) : (
            <div className="field">
              <button className="text-button" type="button" onClick={() => setShowOpp(true)}>
                + Add opponent
              </button>
            </div>
          )}
          <div className="field full">
            <label htmlFor="hitNotes">Game notes</label>
            <textarea
              id="hitNotes"
              maxLength={300}
              placeholder="What worked, anything to follow up"
              defaultValue={game.notes ?? ""}
              key={`notes-${date}`}
              onBlur={(event) => save({ notes: event.target.value.trim() || undefined })}
            />
          </div>
        </div>
      </Card>

      <Card aria-label="This game">
        <CardHead title={formatIsoDate(date)} detail={game.pas.length ? gameLine(game.pas) : "No at-bats yet"} />
        {game.pas.length > 0 && (
          <AtBatList pas={game.pas} onRemove={(index) => save({ pas: game.pas.filter((_, at) => at !== index) })} />
        )}
      </Card>

      <Card aria-label="Log an at-bat" className="atbat-entry">
        <CardHead title={`At-bat ${game.pas.length + 1}`} detail="Pick the result, then anything that went with it." />
        {RESULT_GROUPS.map((group) => (
          <div key={group.group} className="result-group">
            <p className="today-step">{group.group}</p>
            <div className="chip-grid">
              {group.results.map((result) => (
                <button
                  key={result.code}
                  type="button"
                  className={`chip${draft.res === result.code ? " selected" : ""}`}
                  aria-pressed={draft.res === result.code}
                  onClick={() => pick(result.code)}
                >
                  {result.label}
                </button>
              ))}
              {group.group === "Situation" &&
                SITUATION_TAPS.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={`chip tap${draft.taps[key] ? " selected" : ""}`}
                    aria-pressed={Boolean(draft.taps[key])}
                    onClick={() => toggle(key)}
                  >
                    {label}
                  </button>
                ))}
            </div>
          </div>
        ))}

        {draft.res && !isBunt(draft.res) && (
          <div className="result-group">
            <p className="today-step">Hard hit ball?</p>
            <div className="chip-grid">
              {([
                [1, "👍 Yes"],
                [0, "👎 No"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`chip${draft.hh === value ? " selected" : ""}`}
                  aria-pressed={draft.hh === value}
                  onClick={() => setDraft((current) => ({ ...current, hh: current.hh === value ? null : value }))}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {draft.res && inPlay(draft.res) && (
          <div className="result-group">
            <p className="today-step">Where it went · tap the field{draft.zone ? ` · ${draft.zone}` : ""}</p>
            <Field
              label="Tap where the ball went"
              dots={draft.x !== null && draft.y !== null ? [{ x: draft.x, y: draft.y, colour: dotColour(draft.res) }] : []}
              onTap={(x, y) => setDraft((current) => ({ ...current, x, y, zone: fieldZone(x, y) }))}
            />
          </div>
        )}

        {draft.res && (
          <>
            <div className="result-group">
              <p className="today-step">RBI</p>
              <div className="chip-grid">
                {[0, 1, 2, 3, 4].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`chip${draft.rbi === value ? " selected" : ""}`}
                    aria-pressed={draft.rbi === value}
                    onClick={() => setDraft((current) => ({ ...current, rbi: value }))}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
            <div className="result-group">
              <p className="today-step">Quality at-bat · tap any that happened</p>
              <div className="chip-grid">
                {QAB_TAPS.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={`chip tap${draft.taps[key] ? " selected" : ""}`}
                    aria-pressed={Boolean(draft.taps[key])}
                    onClick={() => toggle(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="fineprint">{preview.length ? `QAB ✓ · ${preview.join(", ")}` : "Not a QAB yet"}</p>
            </div>
          </>
        )}

        <div className="form-actions">
          <button
            className="btn btn-dark"
            type="button"
            disabled={!draft.res}
            onClick={() => {
              save({ pas: [...game.pas, toPlateAppearance(draft)] });
              setDraft(emptyDraft());
            }}
          >
            Save at-bat
          </button>
        </div>
      </Card>

      <Card aria-label="Season">
        <CardHead title="Season" detail={`${games.length} game${games.length === 1 ? "" : "s"} logged`} />
        {allPas.length === 0 ? (
          <EmptyState title="No at-bats yet" detail="Log a game's at-bats above and the season builds itself." />
        ) : (
          <>
            <StatTiles pas={allPas} />
            <Field
              label="Spray chart: every ball in play"
              dots={allPas
                .filter((pa) => pa.x !== undefined && pa.y !== undefined)
                .map((pa) => ({ x: pa.x as number, y: pa.y as number, colour: dotColour(pa.res), r: 4.5 }))}
            />
            <p className="spray-legend">
              <span className="hit">Hit</span> <span className="out">Out</span> <span className="error">Error</span>
            </p>
            {tendencyLines ? (
              <>
                <p className="today-step">Tendency · {games.length} games</p>
                <ul className="tendency-list">
                  {tendencyLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="fineprint">Tendency shows once 5 games are logged ({games.length} so far).</p>
            )}
            <p className="today-step">Games</p>
            <ul className="hit-games">
              {games.map((candidate) => (
                <li key={candidate.date}>
                  <button type="button" className="text-button" onClick={() => setDate(candidate.date)}>
                    {formatIsoDate(candidate.date, { day: "numeric", month: "short" })}
                    {candidate.opp ? ` · vs ${candidate.opp}` : ""}
                  </button>
                  <small>{gameLine(candidate.pas)}</small>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {league && (
        <Card aria-label="League line">
          <CardHead title="GBL line · Ballclubz" detail={`${league.games} games, as the league scorers recorded them`} />
          <div className="hit-tiles">
            {(
              [
                ["AVG", avgFormat(league.avg)],
                ["OBP", avgFormat(league.obp)],
                ["SLG", avgFormat(league.slg)],
                ["PA", String(league.pa)],
                ["H", String(league.h)],
                ["BB", String(league.bb)],
                ["SO", String(league.so)],
                ["RBI", String(league.rbi)],
                ["SB", String(league.sb)],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <strong>{value}</strong>
                <small>{label}</small>
              </div>
            ))}
          </div>
          <ul className="hit-games">
            {[...leagueBatting]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((line) => (
                <li key={`${line.date}-${line.opponent}`}>
                  <span>
                    {formatIsoDate(line.date, { day: "numeric", month: "short" })} · {line.side === "home" ? "vs" : "@"} {line.opponent}
                  </span>
                  <small>
                    {line.h}-for-{line.ab}
                    {line.bb ? `, ${line.bb > 1 ? line.bb : ""}BB` : ""}
                    {line.so ? `, ${line.so > 1 ? line.so : ""}K` : ""}
                    {line.rbi ? ` · ${line.rbi} RBI` : ""}
                    {line.sb ? ` · ${line.sb} SB` : ""}
                  </small>
                </li>
              ))}
          </ul>
        </Card>
      )}
    </>
  );
}
