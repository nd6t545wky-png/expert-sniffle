import { MechanicsAnalysis } from "../../src/domain/api";
import { MetricScore, Routine, prescribeRoutine, routineInOrder } from "../../src/domain/mechanicsDrills";
import { Alert, Card, CardHead, Disclosure } from "./Page";

/**
 * The screen's numbers, and the work that follows from them.
 *
 * A rating on its own tells an athlete they are bad at something without
 * telling them what to do about it. This shows each rated quality, then the
 * routine built from the ones that scored low — in the order it should be
 * done, not grouped by which number produced it.
 *
 * Qualities the capture could not rate are shown as not assessed rather than
 * omitted. A missing rating and a good one look identical if you only draw
 * the bars you have.
 */

const STATUS_TONE: Record<MetricScore["status"], string> = {
  priority: "yellow",
  monitor: "team",
  strength: "green",
  "not-assessed": "",
};

const STATUS_LABEL: Record<MetricScore["status"], string> = {
  priority: "Work on this",
  monitor: "Monitor",
  strength: "Strength",
  "not-assessed": "Not assessed",
};

export function MechanicsRoutine({ analysis }: { analysis: MechanicsAnalysis | null }) {
  const routine: Routine = prescribeRoutine(analysis);
  if (!analysis) return null;

  const ordered = routineInOrder(routine);

  return (
    <>
      <Card>
        <CardHead title="Screen results" detail="Rated 1–5 from this capture" />
        <div className="mech-scores">
          {routine.scores.map((score) => (
            <div key={score.key} className={`mech-score${score.rating === null ? " unrated" : ""}`}>
              <div className="mech-score-head">
                <strong>{score.label}</strong>
                <span className={`status ${STATUS_TONE[score.status]}`.trim()}>
                  {STATUS_LABEL[score.status]}
                </span>
              </div>
              <div
                className="mech-bar"
                role="img"
                aria-label={
                  score.rating === null
                    ? `${score.label}: not assessed from this camera angle`
                    : `${score.label}: ${score.rating} out of 5`
                }
              >
                {[1, 2, 3, 4, 5].map((step) => (
                  <span
                    key={step}
                    className={score.rating !== null && step <= score.rating ? "filled" : ""}
                  />
                ))}
              </div>
              <small>{score.meaning}</small>
            </div>
          ))}
        </div>
        <p className="fineprint">
          A qualitative screen from a single phone camera — not laboratory biomechanics. Ratings are
          a starting point for a coach's eye, not a measurement.
        </p>
      </Card>

      {!routine.available ? (
        <Alert tone={analysis.analyzable ? "info" : "warn"}>
          <strong>No drills prescribed</strong>
          {/* The capture's blockers are already listed above by the screen
              result — repeating them here says the same thing twice. */}
          <p>
            {analysis.analyzable
              ? routine.reason
              : "The capture could not be analysed, so nothing has been rated and nothing is prescribed. Re-shoot and screen again."}
          </p>
        </Alert>
      ) : (
        <>
          <Card>
            <CardHead
              title="Prescribed routine"
              detail={`${ordered.reduce((n, g) => n + g.drills.length, 0)} drills · about ${routine.minutes} minutes`}
            />
            <p className="fineprint">
              Built from the {routine.blocks.length === 1 ? "quality" : "qualities"} that scored
              lowest:{" "}
              {routine.blocks.map((block, index) => (
                <span key={block.metric}>
                  {index > 0 ? " and " : ""}
                  <strong>
                    {block.label} ({block.rating}/5)
                  </strong>
                </span>
              ))}
              . Everything else is left alone deliberately — a list of eighteen drills is not a plan.
            </p>

            {routine.weightedBallNote && (
              <Alert tone="warn">
                <strong>This routine includes weighted-implement throws</strong>
                <p>{routine.weightedBallNote}</p>
              </Alert>
            )}
          </Card>

          {/* Where in the delivery each fault shows up. "Sequencing is a 2"
              is a grade; "it goes wrong at foot strike" is something you can
              actually look at. */}
          <Card>
            <CardHead title="Where it shows up" detail="The delivery frame each fault is judged at" />
            <div className="mini-list">
              {routine.blocks.map((block) => (
                <div className="mini-row" key={block.metric}>
                  <span className="mini-icon">{block.rating}</span>
                  <div>
                    <strong>
                      {block.label} · {block.checkpoint.label}
                    </strong>
                    <p>{block.checkpoint.look}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {ordered.map((group) => (
            <Card key={group.slot}>
              <CardHead title={group.label} detail={`${group.drills.length} drill${group.drills.length === 1 ? "" : "s"}`} />
              <ul className="task-list">
                {group.drills.map((drill) => (
                  <li key={drill.id} className="task">
                    <span className="mech-drill-dot" aria-hidden="true" />
                    <div>
                      <div className="task-title">{drill.name}</div>
                      <div className="task-prescription">{drill.prescription}</div>
                      <p className="task-cue">{drill.cue}</p>
                      <p className="fineprint">
                        <strong>Why:</strong> {drill.why} · <strong>Needs:</strong> {drill.equipment}
                      </p>
                    </div>
                    <div className="task-actions">
                      <span className="status">{drill.minutes} min</span>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}

          <Disclosure title="How this routine was chosen" detail="The rules, so you can argue with them">
            <div className="mini-list">
              <div className="mini-row">
                <span className="mini-icon">1</span>
                <div>
                  <strong>Only what was rated</strong>
                  <p>
                    Nothing is prescribed from a quality the capture could not see. A rear-view
                    screen cannot judge sequencing or arm timing, so those come back unrated rather
                    than assumed fine.
                  </p>
                </div>
              </div>
              <div className="mini-row">
                <span className="mini-icon">2</span>
                <div>
                  <strong>Worst first, and only two</strong>
                  <p>
                    Qualities at 2/5 or below are treated as priorities, worst first, capped at two.
                    If nothing is that low, the single 3/5 becomes the focus.
                  </p>
                </div>
              </div>
              <div className="mini-row">
                <span className="mini-icon">3</span>
                <div>
                  <strong>A coach confirms it</strong>
                  <p>
                    These are conventional drills matched to a quality, not a diagnosis. Take the
                    routine to your coach before it replaces anything they have given you.
                  </p>
                </div>
              </div>
            </div>
          </Disclosure>
        </>
      )}
    </>
  );
}
