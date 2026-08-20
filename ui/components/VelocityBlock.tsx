/**
 * What this week is for, as far as throwing hard is concerned.
 *
 * The plan already tells the athlete what to do today. It did not tell them
 * where today sits in a plan to add velocity — which matters most on the weeks
 * the answer is "nowhere, and deliberately so". A capped Wednesday with no
 * explanation reads as a programme that has gone soft; the same Wednesday with
 * "In season · week 3 of 8" beside it reads as a decision.
 *
 * The band strip is the part worth having. Four segments, the week's ceiling
 * filled and everything above it left empty, so the ceiling is visible without
 * reading anything.
 */

import {
  BAND_LABELS,
  BAND_ORDER,
  BAND_RANGES,
  BLOCK_LABELS,
  IntentBand,
  velocityPolicy,
} from "../../src/domain/velocity";
import { Card } from "./Page";

export function VelocityBlock({ week }: { week: number }) {
  const policy = velocityPolicy(week);
  const ceiling = BAND_ORDER.indexOf(policy.plyoCeiling);

  return (
    <Card>
      <div className="card-head">
        <div>
          {/* "Velocity plan" and not "Velocity block": the line underneath
              already names the block, and on the weeks that *are* the velocity
              block the heading otherwise repeated it word for word. */}
          <h3>Velocity plan</h3>
          <p>
            {BLOCK_LABELS[policy.block]}
            {policy.blockWeeks > 1 ? ` · week ${policy.weekInBlock} of ${policy.blockWeeks}` : ""}
            {policy.provisional ? " · provisional draw" : ""}
          </p>
        </div>
        <strong>{BAND_RANGES[policy.plyoCeiling]}</strong>
      </div>

      <ul
        className="velocity-bands"
        aria-label={`Plyo ball intent ceiling: ${BAND_LABELS[policy.plyoCeiling]}, ${BAND_RANGES[policy.plyoCeiling]}`}
      >
        {BAND_ORDER.map((band: IntentBand, index) => (
          <li
            key={band}
            className={`velocity-band${index <= ceiling ? " reached" : ""}${
              index === ceiling ? " ceiling" : ""
            }`}
          >
            <span>{BAND_LABELS[band]}</span>
            <small>{BAND_RANGES[band]}</small>
          </li>
        ))}
      </ul>

      <p className="velocity-note">{policy.note}</p>

      {/* The one thing a ceiling cannot say on its own: whether this week is
          supposed to be the hard one. */}
      <p className="velocity-verdict">
        {policy.velocityDay
          ? "One high-intent throwing exposure this week, on Wednesday."
          : "No high-intent throwing exposure this week."}
      </p>
    </Card>
  );
}
