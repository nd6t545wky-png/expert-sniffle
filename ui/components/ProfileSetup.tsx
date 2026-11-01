import { useState } from "react";
import {
  AthleteProfile,
  BatSide,
  GBL_TEAMS,
  Hand,
  PLAYER_TYPES,
  PlayerType,
  hits,
  readAthleteProfile,
} from "../../src/domain/athleteProfile";
import { Card, CardHead } from "./Page";

const OTHER = "__other__";

/**
 * The questions every account answers once: name, team, player type, and
 * which hand they throw and bat with. Shown full-screen until answered, and as
 * a card in Settings to change later.
 */
export function ProfileForm({
  profile,
  submitLabel,
  onSave,
}: {
  profile: unknown;
  submitLabel: string;
  onSave: (answers: AthleteProfile) => void;
}) {
  const current = readAthleteProfile(profile);
  const knownTeam = GBL_TEAMS.some((team) => team.name === current.team);
  const [name, setName] = useState(current.name ?? "");
  const [teamChoice, setTeamChoice] = useState(current.team ? (knownTeam ? current.team : OTHER) : "");
  const [otherTeam, setOtherTeam] = useState(knownTeam ? "" : current.team ?? "");
  const [playerType, setPlayerType] = useState<PlayerType | "">(current.playerType ?? "");
  const [throws, setThrows] = useState<Hand>(current.throws ?? "Right");
  const [bats, setBats] = useState<BatSide>(current.bats ?? "Right");

  const team = teamChoice === OTHER ? otherTeam.trim() : teamChoice;
  const ready = Boolean(name.trim() && team && playerType);

  return (
    <form
      className="form-grid profile-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        onSave({ name: name.trim(), team, playerType: playerType as PlayerType, throws, bats });
      }}
    >
      <div className="field full">
        <label htmlFor="profileName">Your name</label>
        <input
          id="profileName"
          type="text"
          autoComplete="name"
          maxLength={60}
          placeholder="As it appears on your team sheet"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <small>Used to find your stats on Ballclubz, so spell it the way your club does.</small>
      </div>

      <div className="field full">
        <label htmlFor="profileTeam">Who do you play for?</label>
        <select id="profileTeam" value={teamChoice} onChange={(event) => setTeamChoice(event.target.value)}>
          <option value="" disabled>
            Choose your team
          </option>
          <optgroup label="GBL Division 1">
            {GBL_TEAMS.map((option) => (
              <option key={option.name} value={option.name}>
                {option.name}
              </option>
            ))}
          </optgroup>
          <option value={OTHER}>Another team…</option>
        </select>
        <small>A GBL club brings in its draw and your league stats automatically.</small>
      </div>

      {teamChoice === OTHER && (
        <div className="field full">
          <label htmlFor="profileOtherTeam">Team name</label>
          <input
            id="profileOtherTeam"
            type="text"
            maxLength={60}
            value={otherTeam}
            onChange={(event) => setOtherTeam(event.target.value)}
          />
        </div>
      )}

      <fieldset className="field full player-type-choice">
        <legend>What do you play?</legend>
        {PLAYER_TYPES.map((option) => (
          <label key={option.value} className={`choice-card ${playerType === option.value ? "selected" : ""}`.trim()}>
            <input
              type="radio"
              name="playerType"
              value={option.value}
              checked={playerType === option.value}
              onChange={() => setPlayerType(option.value)}
            />
            <span>
              <strong>{option.label}</strong>
              <small>{option.help}</small>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="field">
        <label htmlFor="profileThrows">Throws</label>
        <select id="profileThrows" value={throws} onChange={(event) => setThrows(event.target.value as Hand)}>
          <option value="Right">Right</option>
          <option value="Left">Left</option>
        </select>
      </div>

      {hits(playerType || undefined) && (
        <div className="field">
          <label htmlFor="profileBats">Bats</label>
          <select id="profileBats" value={bats} onChange={(event) => setBats(event.target.value as BatSide)}>
            <option value="Right">Right</option>
            <option value="Left">Left</option>
            <option value="Switch">Switch</option>
          </select>
        </div>
      )}

      <div className="form-actions">
        <button className="btn btn-dark" type="submit" disabled={!ready}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

/** First run: the app waits here until the profile is answered. */
export function ProfileSetup({ profile, onSave }: { profile: unknown; onSave: (answers: AthleteProfile) => void }) {
  return (
    <Card className="profile-setup" aria-label="Set up your profile">
      <CardHead title="Welcome — a few questions first" detail="This sets up your team, your colours and what the app tracks for you." />
      <ProfileForm profile={profile} submitLabel="Start" onSave={onSave} />
    </Card>
  );
}

/** The same questions in Settings, for when something changes. */
export function ProfileCard({ profile, onSave }: { profile: unknown; onSave: (answers: AthleteProfile) => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <Card aria-label="Your profile">
      <CardHead title="Your profile" detail={saved ? "Saved." : "Team, player type, throws and bats."} />
      <ProfileForm
        profile={profile}
        submitLabel="Save profile"
        onSave={(answers) => {
          onSave(answers);
          setSaved(true);
        }}
      />
    </Card>
  );
}
