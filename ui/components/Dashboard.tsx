import { IsoDate } from "../../src/domain/state";
import { PlanState, ReadinessSubmission, dayNameForDate, isHighIntentDay } from "../../src/domain/session";
import { phaseForWeek, weekWithinPhase, phaseLength } from "../../src/domain/programme";

/**
 * At-a-glance status: today's plan gate, readiness, programme position and
 * throwing load.
 */

export interface DashboardProps {
  date: IsoDate;
  plan: PlanState;
  submission?: ReadinessSubmission;
  selectedWeek: number;
  weekLoad: number;
  onGoToReadiness: () => void;
}

export function Dashboard({
  date,
  plan,
  submission,
  selectedWeek,
  weekLoad,
  onGoToReadiness,
}: DashboardProps) {
  const day = dayNameForDate(date);
  const phase = phaseForWeek(selectedWeek);

  return (
    <section className="card" aria-labelledby="dashboard-heading">
      <h2 id="dashboard-heading">Dashboard</h2>
      <p className="muted">
        {date} — {day}
        {day && isHighIntentDay(day) ? " · high-intent day" : ""}
      </p>

      <dl className="stat-row">
        <div>
          <dt>Readiness</dt>
          <dd>{submission ? `${submission.score}/100` : "Not submitted"}</dd>
        </div>
        <div>
          <dt>Plan</dt>
          <dd>
            {plan.status === "locked" && "Locked"}
            {plan.status === "held" && "Health hold"}
            {plan.status === "unlocked" && plan.planLevel}
          </dd>
        </div>
        <div>
          <dt>Week</dt>
          <dd>{selectedWeek} / 52</dd>
        </div>
        <div>
          <dt>7-day throwing load</dt>
          <dd>{weekLoad}</dd>
        </div>
      </dl>

      {phase && (
        <p className="muted">
          <strong>{phase.name}</strong> — week {weekWithinPhase(selectedWeek)} of {phaseLength(phase)}.
        </p>
      )}

      {plan.status === "locked" && (
        <div className="alert" role="status">
          <strong>Session locked.</strong> {plan.message}{" "}
          <button type="button" className="btn btn-outline" onClick={onGoToReadiness}>
            Complete readiness check
          </button>
        </div>
      )}

      {plan.status === "held" && (
        <div className="alert danger" role="alert">
          <strong>Health hold.</strong> {plan.message}
        </div>
      )}
    </section>
  );
}
