import {
  PROGRAMME_PHASES,
  PROGRAMME_WEEKS,
  phaseForWeek,
  phaseLength,
  weekWithinPhase,
} from "../../src/domain/programme";

/**
 * 52-week annual plan. The phase layout comes from the canonical dataset —
 * no week ranges are written here.
 */

export interface AnnualPlanProps {
  selectedWeek: number;
  onSelectWeek: (week: number) => void;
}

export function AnnualPlan({ selectedWeek, onSelectWeek }: AnnualPlanProps) {
  const phase = phaseForWeek(selectedWeek);

  return (
    <section className="card" aria-labelledby="annual-heading">
      <h2 id="annual-heading">Annual plan</h2>

      <div className="phase-legend">
        {PROGRAMME_PHASES.map((item) => (
          <span key={item.id} className={`phase-chip phase-${item.id}`}>
            {item.name} · weeks {item.startWeek}–{item.endWeek} ({phaseLength(item)})
          </span>
        ))}
      </div>

      <ol className="week-grid">
        {Array.from({ length: PROGRAMME_WEEKS }, (_, index) => index + 1).map((week) => {
          const weekPhase = phaseForWeek(week);
          const selected = week === selectedWeek;
          return (
            <li key={week}>
              <button
                type="button"
                className={`week-cell phase-${weekPhase?.id ?? "unknown"}${selected ? " selected" : ""}`}
                aria-current={selected ? "true" : undefined}
                aria-label={`Week ${week}, ${weekPhase?.name ?? "unassigned"}`}
                onClick={() => onSelectWeek(week)}
              >
                {week}
              </button>
            </li>
          );
        })}
      </ol>

      {phase && (
        <p className="muted">
          Week {selectedWeek} — <strong>{phase.name}</strong>, week {weekWithinPhase(selectedWeek)} of{" "}
          {phaseLength(phase)}.
        </p>
      )}
    </section>
  );
}
