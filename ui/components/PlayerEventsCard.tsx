import { useEffect, useState } from "react";
import { PitchingOsApi } from "../../src/domain/api";
import { PlayerEvent, parseSchedule } from "../../src/domain/playerEvents";
import { Card, CardHead } from "./Page";

interface Player {
  id: string;
  name: string;
  email: string;
  events: PlayerEvent[];
}

/**
 * Owner only: send a tournament's games to one player. Their app adds them to
 * their own games the next time it opens; nobody else's account sees them.
 */
export function PlayerEventsCard({ api }: { api: PitchingOsApi }) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerId, setPlayerId] = useState("");
  const [title, setTitle] = useState("");
  const [schedule, setSchedule] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .listPlayers()
      .then((result) => setPlayers(result.players))
      .catch((cause) => setStatus(cause instanceof Error ? cause.message : String(cause)));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  const parsed = parseSchedule(schedule);
  const player = players.find((candidate) => candidate.id === playerId);

  async function send() {
    if (!player || !title.trim() || !parsed.games.length) return;
    setBusy(true);
    setStatus("");
    try {
      await api.sendPlayerEvent(player.id, title.trim(), parsed.games);
      setStatus(`Sent ${parsed.games.length} game${parsed.games.length === 1 ? "" : "s"} to ${player.name}. They appear next time ${player.name.split(" ")[0]} opens the app.`);
      setSchedule("");
      setTitle("");
      await load();
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card aria-label="Send games to a player">
      <CardHead title="Send games to a player" detail="A tournament or rep squad's schedule, for one player's plan only." />
      <div className="form-grid">
        <div className="field full">
          <label htmlFor="eventPlayer">Player</label>
          <select id="eventPlayer" value={playerId} onChange={(event) => setPlayerId(event.target.value)}>
            <option value="" disabled>
              Choose a player
            </option>
            {players.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name || option.email}
              </option>
            ))}
          </select>
        </div>
        <div className="field full">
          <label htmlFor="eventTitle">Event</label>
          <input
            id="eventTitle"
            type="text"
            maxLength={80}
            placeholder="e.g. APBC 2026 · Team Australia"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="field full">
          <label htmlFor="eventSchedule">Games - one a line, date first</label>
          <textarea
            id="eventSchedule"
            rows={5}
            placeholder={"2026-11-12 vs Korea · 12:00 Tokyo\n13 Nov vs Chinese Taipei · 12:00 Tokyo"}
            value={schedule}
            onChange={(event) => setSchedule(event.target.value)}
          />
          <small>
            {parsed.games.length
              ? `${parsed.games.length} game${parsed.games.length === 1 ? "" : "s"} read.`
              : "Dates like 2026-11-12, 12/11/2026 or 12 Nov."}
            {parsed.skipped.length ? ` Couldn't read: ${parsed.skipped.join("; ")}` : ""}
          </small>
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="btn btn-dark"
            disabled={busy || !player || !title.trim() || !parsed.games.length}
            onClick={() => void send()}
          >
            {busy ? "Sending…" : player ? `Send to ${player.name.split(" ")[0] || "player"}` : "Send"}
          </button>
        </div>
      </div>
      {status && <p className="fineprint">{status}</p>}

      {players.some((candidate) => candidate.events.length) && (
        <ul className="invite-list">
          {players.flatMap((candidate) =>
            candidate.events.map((event) => (
              <li key={event.id}>
                <div>
                  <strong>{event.title}</strong>
                  <small>
                    {candidate.name} · {event.games.length} game{event.games.length === 1 ? "" : "s"} from {event.games[0]?.date ?? "—"}
                  </small>
                </div>
                <div className="invite-actions">
                  <button
                    type="button"
                    className="text-button danger-text"
                    onClick={() => void api.deletePlayerEvent(candidate.id, event.id).then(load)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      )}
    </Card>
  );
}
