import { useState } from "react";
import { Pitch } from "../../src/domain/pitchLog";
import {
  MOVEMENT,
  MovementCluster,
  MovementShift,
  LABEL_LINE,
  labelLayout,
  movementClusters,
  movementDomain,
  movementFindings,
  movementScale,
  movementShift,
  plottablePitches,
} from "../../src/domain/movement";
import { Alert, EmptyState } from "./Page";

/**
 * Where each pitch actually goes.
 *
 * Break was two columns in a table, which is the one shape that cannot answer
 * the question break exists to answer: are two of my pitches finishing in the
 * same place? This is the answer as a picture.
 *
 * Written for a reader who has never seen a movement plot:
 *
 *   - The four directions are labelled in words — "ride", "drop", "arm side",
 *     "glove side" — not as signed inches on an unlabelled axis.
 *   - The centre is a ball with no break at all, and it says so.
 *   - Each pitch type's name is printed on the plot at its own cluster, so
 *     identity never depends on matching a colour to a legend.
 *
 * That last point is also why nothing here is coloured by pitch type. A
 * scatter puts every pair of series side by side at once, and past three hues
 * no ordering keeps them apart for a colour-blind reader — checked with the
 * palette validator, not guessed. A printed name works for everyone.
 */

export interface MovementPlotProps {
  /** The open day's pitches. */
  pitches: Pitch[];
  /** Every earlier day's pitches, for the comparison. */
  priorPitches: Pitch[];
}

function inches(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}″`;
}

function Plot({ clusters, half }: { clusters: MovementCluster[]; half: number }) {
  const scale = movementScale(half);
  const labels = labelLayout(clusters, scale);

  return (
    <svg
      className="movement-svg"
      viewBox={`0 0 ${MOVEMENT.size} ${MOVEMENT.size}`}
      role="img"
      aria-label={`Movement plot: ${clusters
        .map((c) => `${c.pitchType} averages ${c.avgHorzBreakIn} inches horizontal and ${c.avgInducedVertBreakIn} inches vertical break`)
        .join("; ")}`}
    >
      {/* Solid hairline gridlines, one shade off the surface — never dashed. */}
      {scale.ticks.map((tick) => (
        <g key={tick}>
          <line
            className={tick === 0 ? "movement-zero" : "movement-grid"}
            x1={scale.project(tick, -half).x}
            y1={scale.project(tick, -half).y}
            x2={scale.project(tick, half).x}
            y2={scale.project(tick, half).y}
          />
          <line
            className={tick === 0 ? "movement-zero" : "movement-grid"}
            x1={scale.project(-half, tick).x}
            y1={scale.project(-half, tick).y}
            x2={scale.project(half, tick).x}
            y2={scale.project(half, tick).y}
          />
        </g>
      ))}

      {/* The scale, in inches. The plot is comparable session to session only
          if a reader can tell 11 inches from 20, and the compass words alone
          cannot say that. Zero is left off: the crosshair is already named. */}
      {scale.ticks
        .filter((tick) => tick !== 0)
        .map((tick) => (
          <g key={`tick-${tick}`}>
            <text
              className="movement-tick"
              x={scale.project(tick, 0).x}
              y={MOVEMENT.size - MOVEMENT.pad + 15}
              textAnchor="middle"
            >
              {tick}
            </text>
            <text
              className="movement-tick"
              x={MOVEMENT.pad - 7}
              y={scale.project(0, tick).y + 3.5}
              textAnchor="end"
            >
              {tick}
            </text>
          </g>
        ))}

      {/* The four directions, in words. Signed inches on a bare axis is the
          version only a reader who already knew could use. */}
      <text className="movement-compass" x={MOVEMENT.size / 2} y={14} textAnchor="middle">
        ride ↑
      </text>
      <text
        className="movement-compass"
        x={MOVEMENT.size / 2}
        y={MOVEMENT.size - 4}
        textAnchor="middle"
      >
        drop ↓
      </text>
      <text
        className="movement-compass"
        x={MOVEMENT.size - 2}
        y={MOVEMENT.size / 2 - 6}
        textAnchor="end"
      >
        arm side →
      </text>
      <text className="movement-compass" x={2} y={MOVEMENT.size / 2 - 6}>
        ← glove side
      </text>

      {/* Every pitch, quiet. The cloud is the context; the labelled centre is
          the message, so the individual marks stay well back. */}
      {clusters.flatMap((cluster) =>
        cluster.pitches.map((pitch) => {
          const at = scale.project(pitch.horzBreakIn, pitch.inducedVertBreakIn);
          return (
            <circle className="movement-pitch" key={pitch.id} cx={at.x} cy={at.y} r={4}>
              <title>
                {`${pitch.pitchType}${pitch.velocityMph === null ? "" : ` ${pitch.velocityMph.toFixed(1)} mph`} · ${inches(pitch.horzBreakIn)} across, ${inches(pitch.inducedVertBreakIn)} up`}
              </title>
            </circle>
          );
        })
      )}

      {/* Each pitch type's average, named where it sits. The name is placed by
          `labelLayout`, which steps around the dot until it finds a spot that
          collides with neither the axis wording nor an already-placed name. */}
      {clusters.map((cluster, index) => {
        const at = scale.project(cluster.avgHorzBreakIn, cluster.avgInducedVertBreakIn);
        const label = labels[index];
        return (
          <g key={cluster.pitchType}>
            <circle className="movement-mean" cx={at.x} cy={at.y} r={7} />
            <text
              className="movement-label"
              x={label.x}
              y={label.y}
              textAnchor={label.anchor}
            >
              {cluster.pitchType}
            </text>
            <text
              className="movement-sublabel"
              x={label.x}
              y={label.y + LABEL_LINE}
              textAnchor={label.anchor}
            >
              {cluster.count} thrown
              {cluster.avgVelocityMph === null ? "" : ` · ${cluster.avgVelocityMph.toFixed(1)} mph`}
            </text>
          </g>
        );
      })}

      {/* The centre is a real place: a ball moving only under gravity. */}
      <text
        className="movement-origin"
        x={scale.origin.x + 5}
        y={scale.origin.y + 12}
      >
        no break
      </text>
    </svg>
  );
}

function ShiftTable({ shifts }: { shifts: MovementShift[] }) {
  return (
    <div className="scroll-x">
      <table className="pitch-table">
        <thead>
          <tr>
            <th scope="col">Pitch</th>
            <th scope="col">Across</th>
            <th scope="col">Up</th>
            <th scope="col">Speed</th>
            <th scope="col">Compared with</th>
          </tr>
        </thead>
        <tbody>
          {shifts.map((shift) => (
            <tr key={shift.pitchType}>
              <td>{shift.pitchType}</td>
              <td>{inches(shift.deltaHorzBreakIn)}</td>
              <td>{inches(shift.deltaInducedVertBreakIn)}</td>
              <td>
                {shift.deltaVelocityMph === null
                  ? "—"
                  : `${shift.deltaVelocityMph > 0 ? "+" : ""}${shift.deltaVelocityMph.toFixed(1)} mph`}
              </td>
              <td>
                {shift.priorSessions} earlier {shift.priorSessions === 1 ? "session" : "sessions"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MovementPlot({ pitches, priorPitches }: MovementPlotProps) {
  const [showAll, setShowAll] = useState(false);

  const shown = showAll ? [...pitches, ...priorPitches] : pitches;
  const clusters = movementClusters(shown);
  const plotted = plottablePitches(shown);
  const half = movementDomain(plotted);
  const findings = movementFindings(clusters);
  const shifts = movementShift(pitches, priorPitches);

  // How many readings had no break at all. Said out loud rather than quietly
  // omitted — a plot showing four of a session's forty pitches, with nothing
  // explaining the other thirty-six, is worse than no plot.
  const withoutBreak = shown.length - plotted.length;
  const hasHistory = plottablePitches(priorPitches).length > 0;

  return (
    <article className="card card-pad">
      <div className="card-head">
        <div>
          <h3>Movement plot</h3>
          <p>Where each pitch finishes, measured from a ball with no break at all.</p>
        </div>
        {hasHistory && (
          <button
            className="btn btn-outline btn-small"
            type="button"
            aria-pressed={showAll}
            onClick={() => setShowAll((current) => !current)}
          >
            {showAll ? "This session" : "Every session"}
          </button>
        )}
      </div>

      {clusters.length === 0 ? (
        <EmptyState
          title="No break data yet"
          detail={
            shown.length > 0
              ? "The readings on record carry speed but no break. A Rapsodo or TrackMan export fills this in; a radar gun cannot measure it."
              : "Import a Rapsodo or TrackMan export to see where your pitches move."
          }
        />
      ) : (
        <>
          <figure className="movement-figure">
            <Plot clusters={clusters} half={half} />
            <figcaption className="fineprint">
              Each faint dot is one pitch; the ringed dot is that pitch type’s average, named beside
              it. Both axes are inches at the same scale, so the picture has the shape the ball has.
              {withoutBreak > 0 && (
                <>
                  {" "}
                  {withoutBreak} {withoutBreak === 1 ? "reading" : "readings"} carried speed but no
                  break and {withoutBreak === 1 ? "is" : "are"} not plotted.
                </>
              )}
            </figcaption>
          </figure>

          {findings.map((finding) => (
            <Alert key={finding.text} tone={finding.severity === "watch" ? "warn" : "info"}>
              {finding.text}
            </Alert>
          ))}

          <details className="trend-table">
            <summary>See the numbers</summary>
            <div className="scroll-x">
              <table className="pitch-table">
                <thead>
                  <tr>
                    <th scope="col">Pitch</th>
                    <th scope="col">No.</th>
                    <th scope="col">Across</th>
                    <th scope="col">Up</th>
                    <th scope="col">Speed</th>
                    <th scope="col">Repeatability</th>
                  </tr>
                </thead>
                <tbody>
                  {clusters.map((cluster) => (
                    <tr key={cluster.pitchType}>
                      <td>{cluster.pitchType}</td>
                      <td>{cluster.count}</td>
                      <td>{inches(cluster.avgHorzBreakIn)}</td>
                      <td>{inches(cluster.avgInducedVertBreakIn)}</td>
                      <td>
                        {cluster.avgVelocityMph === null
                          ? "—"
                          : `${cluster.avgVelocityMph.toFixed(1)} mph`}
                      </td>
                      <td>±{cluster.spreadIn.toFixed(1)}″</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="fineprint">
              Repeatability is how far a pitch of that type sits from its own average, on average —
              a smaller number means the pitch repeats more tightly.
            </p>
          </details>

          {shifts.length > 0 && !showAll && (
            <details className="trend-table">
              <summary>Today against your earlier sessions</summary>
              <ShiftTable shifts={shifts} />
              <p className="fineprint">
                Only pitches you have thrown before appear here. A pitch thrown for the first time
                today has nothing to be compared with.
              </p>
            </details>
          )}
        </>
      )}
    </article>
  );
}
