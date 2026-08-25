/**
 * The rest of the season, entered by the person who knows it.
 *
 * The built-in draw is eight FNCBA rounds recovered from an old build, ending
 * at Round 19 on 5 September, plus one Cubs date the athlete supplied. Neither
 * league publishes fixtures this app can read — the FNCBA draw lives inside a
 * TeamApp calendar and the Cubs' 2026/27 season has not been drawn — so
 * everything past Round 19, a finals series in particular, can only come from
 * the athlete.
 *
 * Which makes the honesty of the list the whole point. Entered games are
 * labelled as entered and sit beside the recovered rounds rather than
 * pretending to the same standing, because the plan reads both and a guess
 * that looks official is worse than no date at all.
 */

import { useState } from "react";
import { Fixture, allFixtures } from "../../src/domain/fixtures";
import { IsoDate } from "../../src/domain/state";
import { Card, CardHead } from "./Page";

export interface FixtureSettingsProps {
  /** Only the athlete's own entries — the built-in rounds are not editable. */
  fixtures: Fixture[];
  /** Today, so the list can separate what is still to come. */
  today: IsoDate;
  onChange: (next: Fixture[]) => void;
}

const format = (date: string) =>
  new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00+10:00`));

export function FixtureSettings({ fixtures, today, onChange }: FixtureSettingsProps) {
  const [date, setDate] = useState("");
  const [label, setLabel] = useState("");
  const [team, setTeam] = useState("Norths");

  const everything = allFixtures(fixtures);
  const upcoming = everything.filter((fixture) => fixture.date >= today);

  function add() {
    if (!date) return;
    const id = `athlete-${date}-${Date.now().toString(36)}`;
    onChange([...fixtures, { id, date: date as IsoDate, team, label: label.trim() || "Game", source: "athlete-provided" }]);
    setDate("");
    setLabel("");
  }

  return (
    <Card>
      <CardHead
        title="Season fixtures"
        detail="The built-in draw stops at FNCBA Round 19 on 5 September. Finals and anything drawn since have to be added here — the plan reads them and will say so when a game lands in a week it planned as rest."
      />

      {upcoming.length === 0 ? (
        <p className="recovery-caveat">
          Nothing left on the calendar. If your season is not over, add the remaining games below —
          otherwise the plan will treat the coming weeks as an off-season unload.
        </p>
      ) : (
        <ul className="fixture-entries">
          {upcoming.map((fixture) => {
            // Editable means "in the athlete's own list", not "labelled as
            // theirs". The built-in Cubs opener carries the athlete-provided
            // label because that is where the date came from, but it lives in
            // the frozen list — offering Remove on it gave a button that
            // filtered a list the fixture was never in, and did nothing.
            const mine = fixtures.some((entry) => entry.id === fixture.id);
            return (
              <li key={fixture.id}>
                <div>
                  <strong>{fixture.label}</strong>
                  <small>
                    {format(fixture.date)} · {fixture.team} ·{" "}
                    {mine
                      ? "you entered this"
                      : fixture.source === "athlete-provided"
                        ? "supplied earlier, built in"
                        : "from the published draw"}
                  </small>
                </div>
                {mine ? (
                  <button
                    className="text-button danger-text"
                    type="button"
                    aria-label={`Remove ${fixture.label}`}
                    onClick={() => onChange(fixtures.filter((entry) => entry.id !== fixture.id))}
                  >
                    Remove
                  </button>
                ) : (
                  <span className="fixture-source">{fixture.source === "official" ? "Draw" : "Built in"}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="intent-grid">
        <div className="field">
          <label htmlFor="fixture-date">Date</label>
          <input id="fixture-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="fixture-team">Team</label>
          <input id="fixture-team" type="text" maxLength={40} value={team} onChange={(event) => setTeam(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="fixture-label">What is it</label>
          <input
            id="fixture-label"
            type="text"
            maxLength={60}
            placeholder="Semi-final"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>
      </div>
      <div className="form-actions">
        <button className="btn btn-dark" type="button" disabled={!date} onClick={add}>
          {date ? `Add ${format(date)}` : "Pick a date"}
        </button>
      </div>
    </Card>
  );
}
