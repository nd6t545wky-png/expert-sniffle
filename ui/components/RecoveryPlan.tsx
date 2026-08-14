import { useState } from "react";
import { Card, CardHead } from "./Page";
import { IsoDate } from "../../src/domain/state";
import {
  COLD_POLICY,
  CONFLICT_RULES,
  GYM_SESSION_LABELS,
  GymSessionType,
  RecoveryDay,
  ThrowingLoad,
  ThrowingLoadTier,
  buildGymRecoveryPlan,
  buildThrowingRecoveryPlan,
  classifyThrowingLoadTier,
  triggersRecovery,
} from "../../src/domain/recoveryProtocol";

/**
 * The recovery protocol, on screen.
 *
 * The tier is read from what was actually logged rather than asked for — the
 * athlete has already told the app how many balls they threw and at what
 * intent, and asking again would be asking them to classify their own session.
 * When the log does not say enough to tell, the tier is offered as a choice
 * rather than guessed, because a guessed tier changes how many days of work
 * gets prescribed.
 *
 * Every block shows its reasoning behind a disclosure rather than in the
 * flow. The prescription is what you do today; the evidence is there when you
 * want to argue with it, which for a coach is often.
 */

export interface RecoveryPlanProps {
  date: IsoDate;
  /** What was thrown on this date, if anything. */
  load?: ThrowingLoad;
  bodyweightKg?: number | null;
}

const TIER_LABELS: Record<ThrowingLoadTier, string> = {
  light: "Light",
  moderate: "Moderate",
  heavy: "Heavy",
};

const TIER_DETAIL: Record<ThrowingLoadTier, string> = {
  light: "Under 30 throws, or a bullpen at 70% intent or less. Two days.",
  moderate: "30–59 pitches, or a full-intent bullpen. Four days.",
  heavy: "60 pitches or more, or any competitive start. Five days.",
};

function DayCard({ day }: { day: RecoveryDay }) {
  return (
    <div className="recovery-day">
      <div className="recovery-day-head">
        <strong>{day.title}</strong>
        <span>{day.date}</span>
      </div>
      <p className="recovery-day-focus">{day.focus}</p>
      {day.annotation && <p className="recovery-annotation">{day.annotation}</p>}
      <ul className="recovery-blocks">
        {day.blocks.map((block) => (
          <li key={block.id}>
            <div className="recovery-block-head">
              <strong>{block.name}</strong>
              {block.optional && <span className="recovery-optional">optional</span>}
            </div>
            <p className="recovery-prescription">{block.prescription}</p>
            {block.caveat && <p className="recovery-caveat">{block.caveat}</p>}
            <details className="recovery-why">
              <summary>Why</summary>
              <p>{block.why}</p>
              {block.citation && (
                <p className="recovery-citation">
                  <strong>{block.citation.key}</strong> — {block.citation.detail}
                </p>
              )}
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RecoveryPlan({ date, load, bodyweightKg = null }: RecoveryPlanProps) {
  const detected = load ? classifyThrowingLoadTier(load) : null;
  const [chosenTier, setChosenTier] = useState<ThrowingLoadTier | null>(null);
  const [gymType, setGymType] = useState<GymSessionType | null>(null);

  const triggered = load ? triggersRecovery(load) : false;
  const tier = chosenTier ?? detected;

  const throwingPlan = tier
    ? buildThrowingRecoveryPlan({ tier, outingDate: date, bodyweightKg })
    : null;
  const gymPlan = gymType
    ? buildGymRecoveryPlan({ sessionType: gymType, sessionDate: date, bodyweightKg })
    : null;

  return (
    <>
      <Card>
        <CardHead
          title="Recovery protocol"
          detail="Five-day post-throwing curve, plus the post-gym track. No cold anywhere."
        />

        <p className="recovery-policy">
          <strong>No ice, no cold water, no contrast.</strong> {COLD_POLICY.cost}{" "}
          {COLD_POLICY.insteadCarriedBy}
        </p>

        {detected && (
          <p className="recovery-detected">
            Read from what you logged: <strong>{TIER_LABELS[detected]}</strong>.{" "}
            {TIER_DETAIL[detected]}
            {!triggered && " Below the trigger, so this is offered rather than prescribed."}
          </p>
        )}

        {!detected && (
          <p className="recovery-detected">
            Nothing logged for this day says how hard you threw, so the tier is not guessed —
            pick it and the protocol follows.
          </p>
        )}

        <div className="recovery-tiers" role="group" aria-label="Throwing load tier">
          {(Object.keys(TIER_LABELS) as ThrowingLoadTier[]).map((option) => (
            <button
              key={option}
              type="button"
              className={`btn btn-outline btn-small${tier === option ? " is-active" : ""}`}
              aria-pressed={tier === option}
              onClick={() => setChosenTier(tier === option ? null : option)}
            >
              {TIER_LABELS[option]}
            </button>
          ))}
        </div>
      </Card>

      {throwingPlan && (
        <Card>
          <CardHead
            title={`After throwing — ${TIER_LABELS[throwingPlan.tier].toLowerCase()}`}
            detail={`${throwingPlan.days.length} days from ${throwingPlan.outingDate}. Strength peaks at day 5, not day 2.`}
          />
          {throwingPlan.days.map((day) => (
            <DayCard key={day.dayOffset} day={day} />
          ))}
        </Card>
      )}

      <Card>
        <CardHead
          title="After lifting"
          detail="The track the app did not have. Same modalities as throwing — only the dose and timing differ."
        />
        <div className="recovery-tiers" role="group" aria-label="Gym session type">
          {(Object.keys(GYM_SESSION_LABELS) as GymSessionType[]).map((option) => (
            <button
              key={option}
              type="button"
              className={`btn btn-outline btn-small${gymType === option ? " is-active" : ""}`}
              aria-pressed={gymType === option}
              onClick={() => setGymType(gymType === option ? null : option)}
            >
              {GYM_SESSION_LABELS[option]}
            </button>
          ))}
        </div>
        {gymPlan ? (
          gymPlan.days.map((day) => <DayCard key={day.dayOffset} day={day} />)
        ) : (
          <p className="recovery-detected">Pick the session type you did and the block follows.</p>
        )}
      </Card>

      <Card>
        <CardHead
          title="Lifting and throwing on the same day"
          detail="With cold out, there are no modality conflicts left — only order."
        />
        <ul className="recovery-rules">
          {CONFLICT_RULES.map((rule) => (
            <li key={rule.situation}>
              <strong>{rule.situation}</strong>
              <span>{rule.rule}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
