import { useEffect, useState } from "react";
import { Invite, PitchingOsApi } from "../../src/domain/api";
import { Alert, Card, CardHead } from "./Page";

/**
 * The owner's invite list: make a link for a player, copy it, revoke an unused
 * one. Accounts are invite-only, so this card is how anyone else gets in.
 */
export function InvitesCard({ api }: { api: PitchingOsApi }) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    api
      .listInvites()
      .then((result) => setInvites(result.invites))
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [api]);

  async function create() {
    setBusy(true);
    setError("");
    try {
      const invite = await api.createInvite(note.trim());
      setInvites((current) => [invite, ...current]);
      setNote("");
      await copy(invite);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function copy(invite: Invite) {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Join Pitching OS", text: "Your invite to the training app", url: invite.link });
      } else {
        await navigator.clipboard.writeText(invite.link);
      }
      setCopied(invite.code);
    } catch {
      // Cancelling the share sheet is not an error worth showing.
    }
  }

  async function revoke(code: string) {
    setError("");
    try {
      await api.revokeInvite(code);
      setInvites((current) =>
        current.map((invite) => (invite.code === code ? { ...invite, revokedAt: new Date().toISOString() } : invite))
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  const status = (invite: Invite) =>
    invite.usedAt ? `Joined${invite.usedBy ? ` · ${invite.usedBy}` : ""}` : invite.revokedAt ? "Revoked" : "Not used yet";

  return (
    <Card aria-label="Invite players">
      <CardHead
        title="Invite players"
        detail="Accounts are invite-only. Each link works once — make one per player and send it to them."
      />
      <div className="form-grid">
        <div className="field">
          <label htmlFor="inviteNote">Who it's for</label>
          <input
            id="inviteNote"
            type="text"
            maxLength={60}
            placeholder="e.g. Ty Iddon"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <div className="form-actions">
          <button className="btn btn-dark" type="button" disabled={busy} onClick={create}>
            {busy ? "Making link…" : "Make invite link"}
          </button>
        </div>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {invites.length > 0 && (
        <ul className="invite-list">
          {invites.map((invite) => {
            const open = !invite.usedAt && !invite.revokedAt;
            return (
              <li key={invite.code}>
                <div>
                  <strong>{invite.note || invite.code}</strong>
                  <small>
                    {status(invite)}
                    {invite.note ? ` · ${invite.code}` : ""}
                  </small>
                </div>
                {open && (
                  <div className="invite-actions">
                    <button className="text-button" type="button" onClick={() => copy(invite)}>
                      {copied === invite.code ? "Copied" : "Share"}
                    </button>
                    <button className="text-button danger-text" type="button" onClick={() => revoke(invite.code)}>
                      Revoke
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
