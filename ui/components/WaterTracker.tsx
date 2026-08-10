/**
 * Hydration tracker, ported from the prototype's `renderWaterTracker`.
 *
 * The stylesheet already carries the whole widget — `.water-tracker`,
 * `.water-bottle-svg`, `.water-liquid`, `.water-wave`, `.water-readout`,
 * `.water-progress-track`, `.water-buttons`. A card with a row of `.btn`s in
 * its place is not a simplification, it is a different component that happens
 * to add litres: the tap-the-bottle interaction, the animated fill and the
 * progress readout are all the original's, so they are reproduced here.
 *
 * Geometry (fill range, wave offsets, bottle path) is copied verbatim — the
 * numbers are tuned to the SVG's 180×350 viewBox and mean nothing on their own.
 */

const round = (value: number, places = 2) => Number(value.toFixed(places));
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const BOTTLE_PATH =
  "M70 47v16c0 9-12 12-20 25-8 13-12 27-12 44v158c0 22 11 32 31 32h42c20 0 31-10 31-32V132c0-17-4-31-12-44-8-13-20-16-20-25V47Z";

const wave = (y: number) =>
  `M-180 ${y} Q-135 ${y - 8} -90 ${y}T0 ${y}T90 ${y}T180 ${y}T270 ${y}T360 ${y}V340H-180Z`;

export interface WaterTrackerProps {
  date: string;
  /** Litres logged today. */
  logged: number;
  /** Daily fluid target in litres; 0 when none is set. */
  goal: number;
  /** Extra quick-add buttons, in litres. */
  presets?: number[];
  /** Positive to add, negative to remove, "reset" to clear the day. */
  onChange: (litres: number | "reset") => void;
}

export function WaterTracker({ date, logged, goal, presets = [0.5, 0.75], onChange }: WaterTrackerProps) {
  const rawPercent = goal > 0 ? Math.round((logged / goal) * 100) : 0;
  const fillPercent = clamp(rawPercent, 0, 100);
  const fillY = round(311 - (238 * fillPercent) / 100, 1);
  const remaining = goal > 0 ? Math.max(round(goal - logged, 2), 0) : 0;
  const over = goal > 0 ? Math.max(round(logged - goal, 2), 0) : 0;
  const complete = goal > 0 && logged >= goal;

  // Ids must be unique per instance: two trackers on a page would otherwise
  // share one clip path and one gradient.
  const suffix = String(date).replace(/[^0-9]/g, "");
  const clipId = `water-clip-${suffix}`;
  const gradientId = `water-gradient-${suffix}`;

  const status = !goal
    ? "Set a fluid target below to track progress"
    : complete
      ? `Target reached${over ? ` · ${over} L over` : ""}`
      : logged
        ? `${remaining} L to go`
        : `Start filling toward ${goal} L`;

  const quickAdds = [...new Set(presets.map(Number).filter((value) => value > 0 && value <= 5))].slice(0, 4);

  return (
    <article className={`card water-tracker ${complete ? "complete" : ""}`.trim()} data-water-fill={fillPercent}>
      <div className="water-tracker-grid">
        <div className="water-visual-wrap">
          <button
            className="water-bottle-button"
            type="button"
            aria-label={`Add 250 millilitres of water. Current total ${logged} litres.`}
            onClick={() => onChange(0.25)}
          >
            <svg className="water-bottle-svg" viewBox="0 0 180 350" aria-hidden="true" focusable="false">
              <defs>
                <clipPath id={clipId}>
                  <path d={BOTTLE_PATH} />
                </clipPath>
                <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" className="water-stop-bright" />
                  <stop offset="1" className="water-stop-deep" />
                </linearGradient>
              </defs>
              <g clipPath={`url(#${clipId})`} className="water-liquid" style={{ opacity: fillPercent > 0 ? 1 : 0 }}>
                <rect x="34" y={fillY} width="112" height={round(330 - fillY, 1)} fill={`url(#${gradientId})`} />
                <path className="water-wave water-wave-back" d={wave(fillY)} />
                <path className="water-wave water-wave-front" d={wave(fillY + 4)} />
                <circle className="water-bubble bubble-one" cx="68" cy="278" r="4" />
                <circle className="water-bubble bubble-two" cx="112" cy="245" r="3" />
                <circle className="water-bubble bubble-three" cx="91" cy="300" r="2.5" />
              </g>
              <path className="water-bottle-shell" d={BOTTLE_PATH} />
              <rect className="water-bottle-cap" x="65" y="22" width="50" height="29" rx="8" />
              <path className="water-bottle-shine" d="M57 103c-7 12-9 24-9 42v116" />
              {complete && (
                <g className="water-target-check">
                  <circle cx="90" cy="178" r="29" />
                  <path d="m76 178 10 10 19-22" />
                </g>
              )}
            </svg>
            <span className="water-tap-hint">Tap bottle · +250 mL</span>
          </button>
        </div>

        <div className="water-panel">
          <div>
            <p className="eyebrow">Hydration</p>
            <h3>Fill your bottle.</h3>
            <p>Log what you actually drink. The moving water follows today's saved total.</p>
          </div>
          <div className="water-readout" role="status" aria-live="polite">
            <strong>{logged} L</strong>
            <span>{goal ? `of ${goal} L · ${rawPercent}%` : "No target set"}</span>
          </div>
          <div className="water-progress-track" aria-hidden="true">
            <i style={{ width: `${fillPercent}%` }} />
          </div>
          <p className={`water-status ${complete ? "complete" : ""}`.trim()}>
            {complete ? "✓ " : ""}
            {status}
          </p>
          <div className="water-buttons" aria-label="Adjust water total">
            <button type="button" aria-label="Remove 250 millilitres" onClick={() => onChange(-0.25)}>
              −250 mL
            </button>
            <button type="button" onClick={() => onChange(0.25)}>
              +250 mL
            </button>
            {quickAdds.map((value) => (
              <button key={value} type="button" onClick={() => onChange(value)}>
                +{Math.round(value * 1000)} mL
              </button>
            ))}
            <button
              className="text-button danger-text water-reset"
              type="button"
              onClick={() => onChange("reset")}
            >
              Reset today
            </button>
          </div>
          <p className="fineprint">
            This records fluid volume only. Your target should reflect your sports-dietitian plan and
            measured sweat losses rather than a generic formula.
          </p>
        </div>
      </div>
    </article>
  );
}
