import { IsoDate } from "../../src/domain/state";
import { PlanState, ReadinessSubmission } from "../../src/domain/session";
import { HealthPrefillRecord, wearableLabel } from "../../src/domain/healthPrefill";
import { PageId } from "./Shell";

/**
 * Dashboard.
 *
 * Markup mirrors the prototype exactly: `section.page-head.dashboard-page-head`
 * with the club logo, `section.today-focus > article.card.hero-session`, and a
 * `section.grid.metrics.today-shortcuts` of `button.card.metric.metric-shortcut`
 * tiles. The stylesheet is written against these selectors.
 */

export interface DashboardProps {
  date: IsoDate;
  plan: PlanState;
  submission?: ReadinessSubmission;
  /** Today's imported health payload, for the readiness tile's source tag. */
  health?: HealthPrefillRecord;
  /** e.g. "Week 4 · FNCBA Winter · In Season" */
  eyebrow: string;
  /** e.g. "Friday 7 August" */
  heading: string;
  /** The week's focus line. */
  focus: string;
  teamName: string;
  teamLogo: string;
  teamLogoAlt: string;
  sessionTitle: string;
  sessionDescription: string;
  sessionDuration: string;
  sessionStress: string;
  taskCount: number;
  completedCount: number;
  weekLoad: number;
  hydrationLitres: number;
  fluidTarget: number;
  onNavigate: (page: PageId) => void;
  onOpenPlan: () => void;
}

export function Dashboard({
  plan,
  submission,
  health,
  eyebrow,
  heading,
  focus,
  teamName,
  teamLogo,
  teamLogoAlt,
  sessionTitle,
  sessionDescription,
  sessionDuration,
  sessionStress,
  taskCount,
  completedCount,
  weekLoad,
  hydrationLitres,
  fluidTarget,
  onNavigate,
  onOpenPlan,
}: DashboardProps) {
  const locked = plan.status === "locked";
  const held = plan.status === "held";
  const source = wearableLabel(health ?? {});

  const kicker = held
    ? "Health hold"
    : locked
      ? `${heading.split(" ")[0]} · Check-in required`
      : `${heading.split(" ")[0]} · Plan unlocked`;

  const kickerDetail = held
    ? "The planned session is replaced with recovery and qualified review"
    : locked
      ? "Complete the health check-in to set today’s workload"
      : `Plan level ${plan.status === "unlocked" ? plan.planLevel : ""}`;

  return (
    <>
      <section className="page-head dashboard-page-head">
        <div className="dashboard-heading">
          <div className="team-logo-wrap">
            <img src={teamLogo} alt={teamLogoAlt} />
          </div>
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2>{heading}</h2>
            <p>{focus}</p>
            <span className="team-wordmark">{teamName}</span>
          </div>
        </div>
      </section>

      <section className="today-focus">
        <article className="card hero-session">
          <div className="hero-priority">
            <span className="kicker">{kicker}</span>
            <span>{kickerDetail}</span>
          </div>
          <h3>{sessionTitle}</h3>
          <p>{sessionDescription}</p>
          <div className="hero-meta">
            <span>
              <b>{sessionDuration}</b>Duration
            </span>
            <span>
              <b>{sessionStress}</b>Stress
            </span>
            <span>
              <b>{taskCount}</b>Tasks
            </span>
          </div>
          <button className="btn btn-primary hero-action" type="button" onClick={onOpenPlan}>
            {locked ? "Complete check-in" : "Open session"} <span aria-hidden="true">→</span>
          </button>
        </article>
      </section>

      <section className="grid metrics today-shortcuts">
        <button
          className="card metric metric-shortcut accent"
          type="button"
          onClick={() => onNavigate("readiness")}
        >
          <span className="metric-label">Readiness</span>
          <span className="metric-value">{submission ? submission.score : "—"}</span>
          <span className="metric-detail">
            {submission ? `Plan level ${submission.planLevel}` : "Complete today’s check-in"}
          </span>
          {/* Whether this score came off a device or out of a questionnaire is
              the whole point of the tag — it must not claim a ring that did
              not report. */}
          <span
            className={`data-source ${source.kind}`}
            title={
              source.kind === "sensor"
                ? "Imported from a connected sensor or health service"
                : "Entered or confirmed by the athlete"
            }
          >
            {source.label}
          </span>
          <span className="metric-arrow" aria-hidden="true">
            ›
          </span>
        </button>

        <button
          className="card metric metric-shortcut accent"
          type="button"
          onClick={() => onNavigate("workload")}
        >
          <span className="metric-label">Active workload</span>
          <span className="metric-value">{weekLoad || "—"}</span>
          <span className="metric-detail">
            {locked ? "Plan remains locked" : "7-day weighted throwing load"}
          </span>
          <span className="data-source manual" title="Entered or confirmed by the athlete">
            Plan rules
          </span>
          <span className="metric-arrow" aria-hidden="true">
            ›
          </span>
        </button>

        <button
          className="card metric metric-shortcut good"
          type="button"
          onClick={onOpenPlan}
        >
          <span className="metric-label">Session progress</span>
          <span className="metric-value">
            {taskCount ? `${Math.round((completedCount / taskCount) * 100)}%` : "—"}
          </span>
          <span className="metric-detail">
            {completedCount} of {taskCount} resolved
          </span>
          <span className="metric-arrow" aria-hidden="true">
            ›
          </span>
        </button>

        <button
          className="card metric metric-shortcut warn"
          type="button"
          onClick={() => onNavigate("nutrition")}
        >
          <span className="metric-label">Hydration</span>
          {/* v60 prints the stored value with a unit — "0.5 L", not "0.50".
              Two views of one number must not format it differently. */}
          <span className="metric-value">{hydrationLitres ? `${hydrationLitres} L` : "—"}</span>
          <span className="metric-detail">
            {fluidTarget ? `of ${fluidTarget} L target` : "Set a fluid target"}
          </span>
          <span className="metric-arrow" aria-hidden="true">
            ›
          </span>
        </button>
      </section>
    </>
  );
}
