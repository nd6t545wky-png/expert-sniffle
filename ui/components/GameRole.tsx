import { GAME_ROLES, GameRole } from "../../src/domain/programmeSessions";
import { Card, CardHead } from "./Page";

/**
 * "Are you playing today?" — asked on game days only.
 *
 * A select like the check-in's other questions. It starts unanswered so a
 * game day is never quietly assumed to be a start.
 */
export function GameRoleField({
  value,
  onChange,
  id = "gameRole",
}: {
  value: GameRole | null;
  onChange: (role: GameRole) => void;
  id?: string;
}) {
  const help = GAME_ROLES.find((role) => role.value === value)?.help ?? "Sets today's game-day plan.";
  return (
    <div className="field">
      <label htmlFor={id}>Are you playing today?</label>
      <select
        id={id}
        name="gameRole"
        required
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value as GameRole)}
      >
        <option value="" disabled>
          Choose one
        </option>
        {GAME_ROLES.map((role) => (
          <option key={role.value} value={role.value}>
            {role.label}
          </option>
        ))}
      </select>
      <small>{help}</small>
    </div>
  );
}

/** The same answer, changeable after the check-in — line-ups change. */
export function GameRoleCard({ value, onChange }: { value: GameRole | null; onChange: (role: GameRole) => void }) {
  return (
    <Card aria-label="Playing today">
      <CardHead title="Game day" detail="Line-up changed? Update this and the plan follows." />
      <div className="form-grid">
        <GameRoleField id="gameRoleSession" value={value} onChange={onChange} />
      </div>
    </Card>
  );
}
