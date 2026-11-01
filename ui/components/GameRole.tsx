import { GAME_ROLES, GameRole } from "../../src/domain/programmeSessions";
import { Card } from "./Page";

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
  pitcher = true,
}: {
  value: GameRole | null;
  onChange: (role: GameRole) => void;
  id?: string;
  /** A position player is never pitching: only "playing" or "not playing". */
  pitcher?: boolean;
}) {
  const roles = pitcher
    ? GAME_ROLES
    : GAME_ROLES.filter((role) => role.value !== "pitching").map((role) =>
        role.value === "playing"
          ? { ...role, label: "Playing", help: "In the line-up — log your at-bats in the Compete stage." }
          : { ...role, help: "Not in the line-up today." }
      );
  const help = roles.find((role) => role.value === value)?.help ?? "Sets today's game-day plan.";
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
        {roles.map((role) => (
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
export function GameRoleCard({
  value,
  onChange,
  pitcher = true,
}: {
  value: GameRole | null;
  onChange: (role: GameRole) => void;
  pitcher?: boolean;
}) {
  return (
    <Card aria-label="Playing today" className="game-role-card">
      <GameRoleField id="gameRoleSession" value={value} onChange={onChange} pitcher={pitcher} />
    </Card>
  );
}
