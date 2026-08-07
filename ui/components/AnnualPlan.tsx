import {
  PROGRAMME_PHASES,
  PROGRAMME_WEEKS,
  phaseForWeek,
  phaseLength,
  weekWithinPhase,
} from "../../src/domain/programme";
import { Card, PageHead } from "./Page";

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
    <>
      <PageHead
        eyebrow="Annual plan"
        title="The 52-week year."
        intro={phase ? `Week ${selectedWeek} — ${phase.name}.` : undefined}
        controls={
          <select
            className="select"
            value={selectedWeek}
            aria-label="Select week"
            onChange={(event) => onSelectWeek(Number(event.target.value))}
          >
            {Array.from({ length: PROGRAMME_WEEKS }, (_, index) => index + 1).map((week) => (
              <option key={week} value={week}>
                Week {week}
              </option>
            ))}
          </select>
        }
      />

      <Card className="season-calendar-card">
        <div className="phase-band">
          {PROGRAMME_PHASES.map((item) => (
            <span key={item.id} className={`phase-segment phase-${item.id}`}>
              {item.name}
            </span>
          ))}
        </div>

        <ol className="season-calendar-grid week-grid">
          {Array.from({ length: PROGRAMME_WEEKS }, (_, index) => index + 1).map((week) => {
            const weekPhase = phaseForWeek(week);
            const selected = week === selectedWeek;
            return (
              <li key={week}>
                <button
                  type="button"
                  className={`selectable phase-${weekPhase?.id ?? "unknown"}${selected ? " current" : ""}`}
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
          <p className="annual-fineprint">
            Week {selectedWeek} — <strong>{phase.name}</strong>, week {weekWithinPhase(selectedWeek)} of{" "}
            {phaseLength(phase)}.
          </p>
        )}
      </Card>
    </>
  );
}
