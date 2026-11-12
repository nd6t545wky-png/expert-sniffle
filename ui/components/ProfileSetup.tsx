import { useEffect, useRef, useState } from "react";
import type { TeamLookup } from "../../src/domain/teamLookup";
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
import { KNOWN_TEAMS, knownTeam as listedClub, readTeamColours } from "../../src/domain/teamColours";

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
  onLookup,
}: {
  profile: unknown;
  submitLabel: string;
  onSave: (answers: AthleteProfile) => void;
  /** Looks a team up on the web; given when the app is signed in. */
  onLookup?: (team: string, where: string) => Promise<TeamLookup>;
}) {
  const current = readAthleteProfile(profile);
  const knownTeam = Boolean(leagueTeam(current.team));
  const [name, setName] = useState(current.name ?? "");
  const [teamChoice, setTeamChoice] = useState(current.team ? (knownTeam ? current.team : OTHER) : "");
  const [otherTeam, setOtherTeam] = useState(knownTeam ? "" : current.team ?? "");
  const storedSeason = (profile as { season?: { start?: string; end?: string } } | null | undefined)?.season;
  const [seasonStart, setSeasonStart] = useState(storedSeason?.start ?? "");
  const [seasonEnd, setSeasonEnd] = useState(storedSeason?.end ?? "");
  // The league comes first: it decides which draw the season is built from.
  const [leagueChoice, setLeagueChoice] = useState(
    leagueTeam(current.team)?.league.id ?? (current.team ? OTHER : "")
  );
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
  const storedColours = readTeamColours(profile, current.team);
  const [primary, setPrimary] = useState(storedColours?.primary ?? "");
  const [secondary, setSecondary] = useState(storedColours?.secondary ?? "");
  // Picking a GBL or ABL team brings its colours with it.
  const firstTeam = useRef(team);
  useEffect(() => {
    if (team === firstTeam.current) return;
    firstTeam.current = team;
    const known = listedClub(team);
    if (known) {
      setPrimary(known.primary);
      setSecondary(known.secondary);
    }
  }, [team]);
  const shownPrimary = primary || "#1f3a93";
  const shownSecondary = secondary || "#c8102e";

  // Any other team is looked up on the web: logo, colours and draw together.
  const rawProfile = (profile && typeof profile === "object" ? profile : {}) as {
    teamLogo?: unknown;
    teamDraw?: { team?: string; games?: unknown[] };
  };
  const [where, setWhere] = useState("");
  const [lookup, setLookup] = useState<TeamLookup | null>(null);
  const [lookupState, setLookupState] = useState<"" | "busy" | "error">("");
  const [lookupError, setLookupError] = useState("");
  const [logo, setLogo] = useState(typeof rawProfile.teamLogo === "string" ? rawProfile.teamLogo : "");
  const findTeam = async () => {
    if (!onLookup || team.length < 3) return;
    setLookupState("busy");
    setLookupError("");
    try {
      const found = await onLookup(team, where.trim());
      setLookup(found);
      if (found.colours) {
        setPrimary(found.colours.primary);
        setSecondary(found.colours.secondary);
      }
      setLogo(found.logoUrl ?? "");
      setLookupState("");
    } catch (cause) {
      setLookupError(cause instanceof Error ? cause.message : String(cause));
      setLookupState("error");
    }
  };
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
          season: seasonStart && seasonEnd && seasonEnd >= seasonStart ? { start: seasonStart, end: seasonEnd } : null,
          league: leagueChoice === OTHER ? where.trim() || "Other" : leagueChoice,
          ...(teamChoice === OTHER
            ? {
                teamLogo: logo,
                ...(lookup?.fixtures.length
                  ? { teamDraw: { team, fetchedAt: new Date().toISOString(), games: lookup.fixtures, source: lookup.sourceUrl ?? "web" } }
                  : {}),
              }
            : { teamLogo: "" }),
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
        <label htmlFor="profileLeague">Which league are you playing in now?</label>
        <select
          id="profileLeague"
          value={leagueChoice}
          onChange={(event) => {
            setLeagueChoice(event.target.value);
            setTeamChoice(event.target.value === OTHER ? OTHER : "");
          }}
        >
          <option value="" disabled>
            Choose your league
          </option>
          {LEAGUES.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
          <option value={OTHER}>Another league…</option>
        </select>
        <small>Your season is built from this league&apos;s draw: pre-season before it starts, in-season while it runs.</small>
      </div>

      {leagueChoice && leagueChoice !== OTHER && (
        <div className="field full">
          <label htmlFor="profileTeam">Who do you play for?</label>
          <select id="profileTeam" value={teamChoice} onChange={(event) => setTeamChoice(event.target.value)}>
            <option value="" disabled>
              Choose your team
            </option>
            {LEAGUES.find((option) => option.id === leagueChoice)?.teams.map((club) => (
              <option key={club.name} value={club.name}>
                {club.name}
              </option>
            ))}
            <option value={OTHER}>Another team…</option>
          </select>
        </div>
      )}

      {teamChoice === OTHER && (
        <>
          <div className="field full">
            <label htmlFor="profileOtherTeam">Team name</label>
            <input
              id="profileOtherTeam"
              type="text"
              maxLength={60}
              value={otherTeam}
              list="knownClubs"
              onChange={(event) => setOtherTeam(event.target.value)}
            />
            <datalist id="knownClubs">
              {Object.keys(KNOWN_TEAMS).map((club) => (
                <option key={club} value={club} />
              ))}
            </datalist>
          </div>
          {onLookup && (
            <div className="field full team-lookup">
              <label htmlFor="profileTeamWhere">{leagueChoice === OTHER ? "League name and where it is" : "Where is it? (optional)"}</label>
              <input
                id="profileTeamWhere"
                type="text"
                maxLength={60}
                placeholder="League, city or state"
                value={where}
                onChange={(event) => setWhere(event.target.value)}
              />
              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={team.length < 3 || lookupState === "busy"}
                  onClick={() => void findTeam()}
                >
                  {lookupState === "busy" ? "Searching the web…" : "Find my team online"}
                </button>
              </div>
              <small>Searches the web for the club&apos;s logo, colours and draw. Check what it finds before you start.</small>
              {lookupState === "error" && <p className="fineprint">{lookupError}</p>}
              {lookup && (
                <div className="team-found">
                  {logo && <img src={logo} alt="" referrerPolicy="no-referrer" onError={() => setLogo("")} />}
                  <div>
                    <strong>{lookup.league ? `${team} · ${lookup.league}` : team}</strong>
                    <small>
                      {lookup.colours ? "Colours found. " : "No colours found - pick them below. "}
                      {lookup.fixtures.length
                        ? `${lookup.fixtures.length} game${lookup.fixtures.length === 1 ? "" : "s"} found on the draw.`
                        : "No draw found - your week follows the game days you pick below."}
                    </small>
                    {lookup.sourceUrl && (
                      <a href={lookup.sourceUrl} target="_blank" rel="noreferrer">
                        Where it came from
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {listedClub(team) ? (
        <div className="field full">
          <div className="team-found">
            {listedClub(team)!.logo && <img src={listedClub(team)!.logo} alt="" />}
            <div>
              <strong>{listedClub(team)!.name}</strong>
              <small>The app is drawn in your club&apos;s colours.</small>
            </div>
            <span className="colour-preview" aria-hidden="true">
              <span style={{ background: shownPrimary }} />
              <span style={{ background: shownSecondary }} />
            </span>
          </div>
        </div>
      ) : team ? (
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
      ) : null}

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

      {teamChoice === OTHER && !lookup?.fixtures.length && (
        <div className="field full">
          <label htmlFor="profileSeasonStart">When is your season? (optional)</label>
          <div className="season-dates">
            <input
              id="profileSeasonStart"
              type="date"
              aria-label="First game"
              value={seasonStart}
              onChange={(event) => setSeasonStart(event.target.value)}
            />
            <span>to</span>
            <input type="date" aria-label="Last game" value={seasonEnd} min={seasonStart} onChange={(event) => setSeasonEnd(event.target.value)} />
          </div>
          <small>First and last game. Pre-season, in-season and off-season are timed from these.</small>
        </div>
      )}

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
export function ProfileSetup({
  profile,
  onSave,
  onLookup,
}: {
  profile: unknown;
  onSave: (answers: AthleteProfile) => void;
  onLookup?: (team: string, where: string) => Promise<TeamLookup>;
}) {
  return (
    <Card className="profile-setup" aria-label="Set up your profile">
      <CardHead title="Welcome - a few questions first" detail="This sets up your team, your colours and what the app tracks for you." />
      <ProfileForm profile={profile} submitLabel="Start" onSave={onSave} onLookup={onLookup} />
    </Card>
  );
}

/** The same questions in Settings, for when something changes. */
export function ProfileCard({
  profile,
  onSave,
  onLookup,
}: {
  profile: unknown;
  onSave: (answers: AthleteProfile) => void;
  onLookup?: (team: string, where: string) => Promise<TeamLookup>;
}) {
  const [saved, setSaved] = useState(false);
  return (
    <Card aria-label="Your profile">
      <CardHead title="Your profile" detail={saved ? "Saved." : "Team, player type, throws and bats."} />
      <ProfileForm
        profile={profile}
        submitLabel="Save profile"
        onLookup={onLookup}
        onSave={(answers) => {
          onSave(answers);
          setSaved(true);
        }}
      />
    </Card>
  );
}
