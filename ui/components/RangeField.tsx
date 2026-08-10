/**
 * Slider field, reproducing the prototype's range widget exactly.
 *
 * A bare `<input type="range">` inside a `.field` is not what the stylesheet
 * expects. The original wraps it in `.field.range-field` with a label row, a
 * live `<output>`, a reset button, a `.range-wrap` and a min/max scale — and,
 * critically, sets `--range-progress` on the input itself, which is what
 * paints the filled portion of the track. Without that custom property the
 * slider renders as an unstyled stub and reads as broken.
 *
 * Ported from `rangeField` / `rangeValueText` / `defaultRangeValue` in
 * legacy/app.js, including the wording of every value descriptor.
 */

const FIVE_POINT_LABELS: Record<string, string[]> = {
  energy: ["", "Empty", "Low", "Okay", "Good", "Energised"],
  mood: ["", "Very low", "Low", "Okay", "Good", "Excellent"],
  stress: ["", "Low", "Manageable", "Moderate", "High", "Very high"],
};

const SORENESS_LABELS = [
  "None",
  "Minimal",
  "Very mild",
  "Mild",
  "Mild–moderate",
  "Moderate",
  "Moderate–high",
  "High",
  "Very high",
  "Severe",
  "Maximum reported",
];

const RPE_LABELS = [
  "",
  "Very easy",
  "Easy",
  "Easy–moderate",
  "Moderate",
  "Moderately hard",
  "Hard",
  "Very hard",
  "Very hard",
  "Near-maximal",
  "Maximal",
];

const SORENESS_FIELDS = ["shoulder", "elbow", "forearm", "lat", "lower", "postShoulder", "postElbow"];

/**
 * Arm feel has no counterpart in the prototype — it is the rebuild's own
 * field — but it still needs words. Without them the output pill reads
 * "8 8", the number twice, which is what an unlabelled slider degrades to.
 * Higher is better here, so the scale runs the opposite way to soreness.
 */
const ARM_FEEL_LABELS = [
  "",
  "Very poor",
  "Poor",
  "Below normal",
  "Slightly off",
  "Okay",
  "Fair",
  "Good",
  "Very good",
  "Excellent",
  "Best it gets",
];

const RESET_DEFAULTS: Record<string, number> = { energy: 4, mood: 4, stress: 2, rpe: 6, armFeel: 8 };

export function rangeValueText(name: string, value: number): string {
  const fivePoint = FIVE_POINT_LABELS[name]?.[value];
  if (fivePoint) return fivePoint;
  if (name === "rpe" && RPE_LABELS[value]) return RPE_LABELS[value];
  if (name === "armFeel" && ARM_FEEL_LABELS[value]) return ARM_FEEL_LABELS[value];
  if (SORENESS_FIELDS.includes(name)) return SORENESS_LABELS[value] || String(value);
  return String(value);
}

export function defaultRangeValue(name: string, min: number, max: number): number {
  const fallback = RESET_DEFAULTS[name] ?? (min === 0 ? 0 : min);
  return Math.min(max, Math.max(min, fallback));
}

export interface RangeFieldProps {
  name: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  /** The scale hint under the track, e.g. "0 none · 10 severe". */
  help?: string;
  onChange: (value: number) => void;
}

export function RangeField({
  name,
  label,
  value,
  min = 1,
  max = 5,
  help = "1 low · 5 high",
  onChange,
}: RangeFieldProps) {
  const numericValue = Math.min(max, Math.max(min, Math.round(Number(value) || min)));
  const progress = max === min ? 0 : ((numericValue - min) / (max - min)) * 100;
  const valueText = rangeValueText(name, numericValue);
  const resetValue = defaultRangeValue(name, min, max);

  return (
    <div className="field range-field">
      <div className="range-label-row">
        <label htmlFor={name}>{label}</label>
        <div className="range-controls">
          <output className="range-output" data-output={name} htmlFor={name} aria-live="polite">
            <strong data-range-number="">{numericValue}</strong>
            <span data-range-text="">{valueText}</span>
          </output>
          <button
            className="range-reset"
            type="button"
            data-target={name}
            data-value={resetValue}
            onClick={() => onChange(resetValue)}
          >
            Reset
          </button>
        </div>
      </div>
      <div className="range-wrap">
        <input
          id={name}
          name={name}
          type="range"
          min={min}
          max={max}
          step={1}
          value={numericValue}
          // Drives the filled track in styles.css.
          style={{ ["--range-progress" as string]: `${progress}%` }}
          aria-valuetext={`${numericValue} of ${max}, ${valueText}`}
          data-range=""
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <div className="range-scale" aria-hidden="true">
          <span>{min}</span>
          <span>{max}</span>
        </div>
      </div>
      <small>{help}</small>
    </div>
  );
}
