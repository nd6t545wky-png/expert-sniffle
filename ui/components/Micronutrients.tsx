import {
  NutrientTotal,
  coverageSentence,
  dailyMicronutrients,
  micronutrientCoverage,
  micronutrientFindings,
} from "../../src/domain/micronutrients";
import { Alert } from "./Page";

/**
 * The nutrients beyond the macros — and, just as loudly, the ones today's
 * labels did not declare.
 *
 * Every calorie tracker on the market prints a confident daily iron figure
 * built by adding missing values as zero. This card refuses to: a total drawn
 * from some of the day's foods is shown as "at least", the row says how many
 * foods declared it, and the app never claims a shortfall on the strength of
 * a number it knows is incomplete.
 *
 * That makes the card less impressive and more useful. A reader can tell the
 * difference between "you are low on iron" and "three of your five foods did
 * not say", which is the difference between a fact and a guess.
 */

export interface MicronutrientsProps {
  /** One entry per food eaten today; absent keys mean the label stayed silent. */
  foods: Record<string, number>[];
  /** Today's calorie target, which the saturated-fat guidance scales with. */
  calorieTarget?: number | null;
}

function amount(row: NutrientTotal): string {
  return `${row.total.toFixed(row.nutrient.precision)}${row.nutrient.unit}`;
}

function Row({ row }: { row: NutrientTotal }) {
  const known = row.declaredBy > 0;
  // A ceiling fills toward a limit and a floor fills toward a goal, but the
  // bar is the same bar — it is the words that say which direction is good.
  const filled = Math.min(100, Math.max(0, row.percent));

  return (
    <li className={`micro-row${known ? "" : " is-unknown"}`}>
      <div className="micro-head">
        <strong>{row.nutrient.label}</strong>
        <span className="micro-amount">
          {known ? (
            <>
              {row.partial && <span className="micro-atleast">at least </span>}
              {amount(row)}
            </>
          ) : (
            "not declared"
          )}
          <small>
            {" "}
            / {row.target}
            {row.nutrient.unit} {row.nutrient.kind === "ceiling" ? "limit" : "target"}
          </small>
        </span>
      </div>

      {/* No bar at all when nothing declared it. An empty track is exactly the
          thing this card exists to avoid — it draws "the label did not say"
          with the same picture as "none of it". */}
      {known && (
        <div className="micro-bar" role="presentation">
          <span
            className={`micro-fill${row.partial ? " is-partial" : ""}`}
            style={{ width: `${filled}%` }}
          />
        </div>
      )}

      <p className="micro-note">
        {known ? (
          <>
            {row.partial
              ? `${row.declaredBy} of ${row.foods} foods declared it — the rest did not say, so this is a floor.`
              : `Every food today declared it.`}{" "}
            {row.nutrient.why}
          </>
        ) : (
          <>No food today declared it. {row.nutrient.why}</>
        )}
      </p>
    </li>
  );
}

export function Micronutrients({ foods, calorieTarget }: MicronutrientsProps) {
  const totals = dailyMicronutrients(foods, { calories: calorieTarget });
  const coverage = micronutrientCoverage(foods);
  const findings = micronutrientFindings(totals);

  // Nutrients with something to say come first. A card that opens on eight
  // empty rows teaches the athlete to stop opening it.
  const ordered = [...totals].sort((a, b) => b.declaredBy - a.declaredBy);

  return (
    <details className="card disclosure-card quiet-disclosure">
      <summary>
        <span>
          <strong>Micronutrients</strong>
          <small>
            {coverage.foods === 0
              ? "Once you log a food"
              : `${coverage.tracked} of ${coverage.total} have something to report`}
          </small>
        </span>
        <span>Show</span>
      </summary>
      <div className="disclosure-body">
        <p className="fineprint disclosure-intro">
          <strong>How to read these:</strong> {coverageSentence(coverage)} Figures come from the food
          label itself, not an estimate — a nutrient a label does not declare is left out rather than
          counted as zero, which is why some totals read “at least”. Targets are the Australian
          reference values for a man 19–30; they are general guidance for a healthy athlete, not
          clinical advice.
        </p>

        {findings.map((finding) => (
          <Alert key={finding.text} tone={finding.severity === "watch" ? "warn" : "info"}>
            {finding.text}
          </Alert>
        ))}

        <ul className="micro-list">
          {ordered.map((row) => (
            <Row key={row.nutrient.id} row={row} />
          ))}
        </ul>

        <p className="fineprint">
          Sodium and fluid both move with sweat. A long session in the heat loses sodium, and
          replacing it is not the same as overeating it — the limit above is written for a normal
          day.
        </p>
      </div>
    </details>
  );
}
