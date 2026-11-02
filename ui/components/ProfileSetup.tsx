import { useState } from "react";
import { LEAGUES, leagueTeam } from "../../src/domain/leagues";
import {
  AthleteProfile,
  BatSide,
  Hand,
  PLAYER_TYPES,
  PlayerType,
  hits,
  readAthleteProfile,
} from "../../src/domain/athleteProfile";
import { Card, CardHead } from "./Page";
import { DAY_SHORT, readSchedule } from "../../src/domain/weeklySchedule";
import { KNOWN_TEAM_COLOURS, readTeamColours } from "../../src/domain/teamColours";

const OTHER = "__other__";

/** Weekday chips; any number can be on. */
function DayPicker({ id, value, onChange }: { id: string; value: number[]; onChange: (days: number[]) => void }) {
  return (
    <div className="chip-grid day-picker" role="group" aria-labelledby={id}>
      {DAY_SHORT.map((label, day) => {
        const on = value.includes(day);
        return (
          <button
            key={label}
            type="button"
            className={`chip ${on ? "selected" : ""}`.trim()}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((d) => d !== day) : [...value, day].sort())}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

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
  const knownTeam = Boolean(leagueTeam(current.team));
  const [name, setName] = useState(current.name ?? "");
  const [teamChoice, setTeamChoice] = useState(current.team ? (knownTeam ? current.team : OTHER) : "");
  const [otherTeam, setOtherTeam] = useState(knownTeam ? "" : current.team ?? "");
  const [playerType, setPlayerType] = useState<PlayerType | "">(current.playerType ?? "");
  const [throws, setThrows] = useState<Hand>(current.throws ?? "Right");
  const [bats, setBats] = useState<BatSide>(current.bats ?? "Right");
  const stored = readSchedule(profile);
  const raw = (profile && typeof profile === "object" ? profile : {}) as { winterTeam?: unknown };
  const [training, setTraining] = useState<number[]>(stored?.training ?? []);
  // GBL clubs play Friday and Sunday; anyone else says when they play.
  const [games, setGames] = useState<number[]>(stored?.games ?? []);
  const [gamesTouched, setGamesTouched] = useState(Boolean(stored));
  const [winter, setWinter] = useState<"" | "yes" | "no">(
    stored ? (stored.winterGames.length ? "yes" : "no") : ""
  );
  const [winterTeam, setWinterTeam] = useState(typeof raw.winterTeam === "string" ? raw.winterTeam : "");
  const [winterGames, setWinterGames] = useState<number[]>(stored?.winterGames.length ? stored.winterGames : [5]);

  const team = teamChoice === OTHER ? otherTeam.trim() : teamChoice;
  // The app is drawn in the team's colours. Known teams start from theirs;
  // anyone else picks two.
  const storedColours = readTeamColours(profile);
  const [primary, setPrimary] = useState(storedColours?.primary ?? "");
  const [secondary, setSecondary] = useState(storedColours?.secondary ?? "");
  const known = KNOWN_TEAM_COLOURS[team];
  const shownPrimary = primary || known?.primary || "#1f3a93";
  const shownSecondary = secondary || known?.secondary || "#c8102e";
  // A league team starts from the days that league plays; the athlete can change them.
  const league = leagueTeam(team)?.league;
  const shownGames = !gamesTouched && games.length === 0 && league ? [...league.usualGameDays] : games;
  const ready = Boolean(
    name.trim() &&
      team &&
      playerType &&
      shownGames.length &&
      winter &&
      (winter === "no" || (winterTeam.trim() && winterGames.length))
  );

  return (
    <form
      className="form-grid profile-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        onSave({
          name: name.trim(),
          team,
          playerType: playerType as PlayerType,
          throws,
          bats,
          schedule: { training, games: shownGames, winterGames: winter === "yes" ? winterGames : [] },
          winterTeam: winter === "yes" ? winterTeam.trim() : "",
          teamColours: { primary: shownPrimary, secondary: shownSecondary },
        });
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
          {LEAGUES.map((option) => (
            <optgroup key={option.id} label={option.name}>
              {option.teams.map((club) => (
                <option key={club.name} value={club.name}>
                  {club.name}
                </option>
              ))}
            </optgroup>
          ))}
          <option value={OTHER}>Another team…</option>
        </select>
        <small>A GBL or ABL team brings in its draw automatically, and your week follows it.</small>
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

      <div className="field full">
        <label id="teamColours">Team colours</label>
        <div className="team-colours" role="group" aria-labelledby="teamColours">
          <label className="colour-pick">
            <input type="color" value={shownPrimary} onChange={(event) => setPrimary(event.target.value)} />
            <span>Main</span>
          </label>
          <label className="colour-pick">
            <input type="color" value={shownSecondary} onChange={(event) => setSecondary(event.target.value)} />
            <span>Second</span>
          </label>
          <span className="colour-preview" aria-hidden="true">
            <span style={{ background: shownPrimary }} />
            <span style={{ background: shownSecondary }} />
          </span>
        </div>
        <small>The app is drawn in these: buttons and headings in the main colour, the progress bar and ticks in the second.</small>
      </div>

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

      <div className="field full">
        <label id="trainingDays">Which nights does your team train?</label>
        <DayPicker id="trainingDays" value={training} onChange={setTraining} />
        <small>Your throwing on those nights is the team&apos;s, so the plan doesn&apos;t add its own.</small>
      </div>

      <div className="field full">
        <label id="gameDays">Which days are your games?</label>
        <DayPicker
          id="gameDays"
          value={shownGames}
          onChange={(next) => {
            setGamesTouched(true);
            setGames(next);
          }}
        />
        <small>Your week is built around these: the day off after a game, the bullpen between, a light catch the day before.</small>
      </div>

      <div className="field full">
        <label htmlFor="profileWinter">Do you play winter ball?</label>
        <select id="profileWinter" value={winter} onChange={(event) => setWinter(event.target.value as "yes" | "no")}>
          <option value="" disabled>
            Choose one
          </option>
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </select>
      </div>

      {winter === "yes" && (
        <>
          <div className="field full">
            <label htmlFor="profileWinterTeam">Winter team</label>
            <input
              id="profileWinterTeam"
              type="text"
              maxLength={60}
              value={winterTeam}
              onChange={(event) => setWinterTeam(event.target.value)}
            />
          </div>
          <div className="field full">
            <label id="winterGameDays">Winter game day</label>
            <DayPicker id="winterGameDays" value={winterGames} onChange={setWinterGames} />
          </div>
        </>
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
