import { useState } from "react";
import { parsePlayerPageUrl } from "../../src/domain/ballclubz";
import { Card, CardHead } from "./Page";

/**
 * Where the app reads the athlete's league game log from.
 *
 * The link is the athlete's own Ballclubz player page. Once set, the app
 * checks it each time it opens and files any new outing into the game log;
 * this card is for changing the link, checking straight away, and seeing what
 * the last check found.
 */
export function BallclubzCard({
  url,
  status,
  busy,
  hasSyncKey,
  onChange,
  onCheckNow,
}: {
  url: string;
  status: string;
  busy: boolean;
  hasSyncKey: boolean;
  onChange: (url: string) => void;
  onCheckNow: () => void;
}) {
  const [draft, setDraft] = useState(url);
  const valid = draft.trim() === "" || parsePlayerPageUrl(draft) !== null;
  const dirty = draft.trim() !== url;

  return (
    <Card aria-label="Ballclubz game log">
      <CardHead
        title="League games from Ballclubz"
        detail="Your GBL pitching lines come in by themselves when the app opens — pitch count, innings, hits, walks, strikeouts. Strikes aren't published there; add them to a game if you want strike rate."
      />
      <div className="form-grid">
        <div className="field full">
          <label htmlFor="ballclubzUrl">Your Ballclubz player page</label>
          <input
            id="ballclubzUrl"
            type="url"
            inputMode="url"
            placeholder="https://ballclubz.com/gbld1/teams/…/…"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <small>
            {!valid
              ? "That isn't a Ballclubz player page. Open your name on the team roster and copy that link."
              : draft.trim() === ""
                ? "Empty turns the import off."
                : "A new season has a new link — paste it here when it changes."}
          </small>
        </div>
        <div className="form-actions">
          {dirty && (
            <button className="btn btn-dark" type="button" disabled={!valid} onClick={() => onChange(draft.trim())}>
              Save link
            </button>
          )}
          {!dirty && url && (
            <button className="btn btn-outline" type="button" disabled={busy || !hasSyncKey} onClick={onCheckNow}>
              {busy ? "Checking…" : "Check now"}
            </button>
          )}
        </div>
      </div>
      {!hasSyncKey ? (
        <p className="fineprint">Turn on cloud autosave (Account &amp; backup) — the check runs through your account.</p>
      ) : (
        status && <p className="fineprint">{status}</p>
      )}
    </Card>
  );
}
