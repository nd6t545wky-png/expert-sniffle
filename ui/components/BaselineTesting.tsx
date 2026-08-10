import {
  BASELINE_ANCHORS,
  BASELINE_RECOMMENDATIONS,
  BASELINE_SECTIONS,
} from "../../src/domain/baseline";
import { strengthWindowKg } from "../../src/domain/programmeUpdates";
import { Card, CardHead, Disclosure } from "./Page";

/**
 * Measured baseline testing, on the athlete page.
 *
 * The anchors come first because those are the numbers the programme
 * actually computes from — the rest is the evidence behind them. Values the
 * reports themselves flagged as below target are marked, because a wall of
 * numbers with nothing distinguished is a wall of numbers.
 */
export function BaselineTesting() {
  const window = strengthWindowKg();

  return (
    <>
      <Card>
        <CardHead title="Baseline testing" detail="Measured — the programme computes loads from these" />

        <div className="grid metrics">
          <article className="card metric">
            <span className="metric-label">Back squat 1RM</span>
            <div className="metric-value">{BASELINE_ANCHORS.backSquat1RmKg} kg</div>
            <div className="metric-detail">Tested, 5-set velocity profile</div>
          </article>
          <article className="card metric">
            <span className="metric-label">Strength window</span>
            <div className="metric-value">
              {window.low}–{window.high} kg
            </div>
            <div className="metric-detail">
              {BASELINE_ANCHORS.strengthPercentRange[0]}–{BASELINE_ANCHORS.strengthPercentRange[1]}% of 1RM
            </div>
          </article>
          <article className="card metric">
            <span className="metric-label">Power load</span>
            <div className="metric-value">{BASELINE_ANCHORS.optimalPowerLoadKg} kg</div>
            <div className="metric-detail">Optimal load for peak power</div>
          </article>
          <article className="card metric">
            <span className="metric-label">Measured BMR</span>
            <div className="metric-value">{BASELINE_ANCHORS.basalMetabolicRateKcal}</div>
            <div className="metric-detail">kcal/day, from DEXA lean mass</div>
          </article>
        </div>

        <p className="fineprint">
          These are measurements, not clearance to train. The DEXA report states its whole-body bone
          density is not for diagnostic use, and neither report replaces medical or coaching review.
        </p>
      </Card>

      {BASELINE_SECTIONS.map((section) => (
        <Disclosure
          key={section.title}
          title={section.title}
          detail={`${section.source} · ${section.measuredOn}`}
        >
          {section.note && <p className="fineprint">{section.note}</p>}
          <table className="tracking-table">
            <thead>
              <tr>
                <th scope="col">Measure</th>
                <th scope="col">Result</th>
                <th scope="col">Context</th>
              </tr>
            </thead>
            <tbody>
              {section.measures.map((measure) => (
                <tr key={measure.label}>
                  <td>{measure.label}</td>
                  <td>
                    <strong>{measure.value}</strong>
                  </td>
                  <td>
                    {measure.context}
                    {measure.flagged && (
                      <>
                        {" "}
                        <span className="status yellow">Flagged</span>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Disclosure>
      ))}

      <Disclosure title="What the reports recommended" detail="Traceable to the programme changes">
        <div className="mini-list">
          {BASELINE_RECOMMENDATIONS.map((item, index) => (
            <div className="mini-row" key={item.heading}>
              <span className="mini-icon">{index + 1}</span>
              <div>
                <strong>{item.heading}</strong>
                <p>{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </Disclosure>
    </>
  );
}
