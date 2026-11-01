import { useEffect, useState } from "react";
import { PitchingOsApi } from "../../src/domain/api";
import { isValidSyncKey, normalizeSyncKey } from "../../src/domain/sync";
import {
  Passkey,
  deletePasskey,
  listPasskeys,
  passkeysSupported,
  registerPasskey,
  signInWithGoogle,
  signInWithPasskey,
  signOut,
} from "../state/authClient";
import { Alert, Card, CardHead, Field, PageHead, TaskRow } from "./Page";
import { DataBackup } from "./DataBackup";
import { InvitesCard } from "./InvitesCard";
import { AppState } from "../../src/domain/state";

/**
 * Sign-in, workspace and cloud-sync status.
 *
 * Sign-in itself is handled by better-auth's hosted routes under
 * /api/auth/*, so this drives those rather than reimplementing OAuth.
 */

export interface AccountProps {
  api: PitchingOsApi;
  syncKey: string;
  onSyncKey: (key: string) => void;
  /**
   * A signed-in account with a workspace: whose it is, its key, and whether it
   * was just created. The app uses it to keep each account's data separate on
   * a shared device. Falls back to `onSyncKey` when not given.
   */
  onAccount?: (account: { userId: string; syncKey: string; isNew: boolean }) => void;
  /** After signing out: the app clears this device. */
  onSignedOut?: () => void | Promise<void>;
  onSyncNow: () => void;
  syncStatus: string;
  /** Everything stored, for the backup file. */
  state?: AppState | null;
  onReplaceState?: (state: AppState) => void;
}

interface Status {
  signedIn: boolean;
  workspaceReady: boolean;
  user?: { id?: string; name: string; email: string; image: string };
  syncKey?: string;
  isOwner?: boolean;
  needsInvite?: boolean;
}

/** Where an invite link's code waits between opening the link and signing in. */
export const INVITE_STORAGE = "pitching-os-invite";

function storedInvite(): string {
  try {
    return window.localStorage.getItem(INVITE_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function Account({
  api,
  syncKey,
  onSyncKey,
  onAccount,
  onSignedOut,
  onSyncNow,
  syncStatus,
  state,
  onReplaceState,
}: AccountProps) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [manualKey, setManualKey] = useState("");
  const [revealKey, setRevealKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [authBusy, setAuthBusy] = useState("");
  const [invite, setInvite] = useState(storedInvite);

  useEffect(() => {
    let cancelled = false;
    api
      .accountStatus()
      .then((result) => {
        if (cancelled) return;
        setStatus(result);
        // A signed-in workspace hands back the sync key; adopt it — through
        // onAccount when given, so the app can check whose data is on the device.
        if (result.syncKey && isValidSyncKey(result.syncKey)) {
          if (onAccount && result.user?.id) onAccount({ userId: result.user.id, syncKey: result.syncKey, isNew: false });
          else onSyncKey(result.syncKey);
        }
        if (result.signedIn) listPasskeys().then(setPasskeys).catch(() => setPasskeys([]));
      })
      .catch((cause) => !cancelled && setError(cause.message));
    return () => {
      cancelled = true;
    };
  }, [api, onSyncKey, onAccount]);

  async function createWorkspace() {
    setBusy(true);
    setError("");
    try {
      // A new player joins with their invite and a fresh workspace — never
      // whatever recovery key this device happens to hold, which could be
      // someone else's. Only the owner's first sign-in adopts the local key,
      // so the data already on this device is not stranded.
      const result = status?.needsInvite
        ? await api.createWorkspace(undefined, invite.trim())
        : await api.createWorkspace(isValidSyncKey(syncKey) ? syncKey : undefined);
      try {
        window.localStorage.removeItem(INVITE_STORAGE);
      } catch {
        // Nothing to clean up.
      }
      if (onAccount && status?.user?.id) {
        onAccount({ userId: status.user.id, syncKey: result.syncKey, isNew: Boolean(status.needsInvite) });
      } else {
        onSyncKey(result.syncKey);
      }
      setStatus((current) => (current ? { ...current, workspaceReady: true, needsInvite: false } : current));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function runAuth(label: string, action: () => Promise<void>) {
    setAuthBusy(label);
    setError("");
    try {
      await action();
      const refreshed = await api.accountStatus();
      setStatus(refreshed);
      if (refreshed.signedIn) setPasskeys(await listPasskeys().catch(() => []));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setAuthBusy("");
    }
  }

  function useManualKey() {
    const normalized = normalizeSyncKey(manualKey);
    if (!isValidSyncKey(normalized)) {
      setError("A recovery key is 64 hexadecimal characters.");
      return;
    }
    setError("");
    onSyncKey(normalized);
    setManualKey("");
  }

  return (
    <>
      <PageHead
        eyebrow="Account"
        title="Account and cloud sync."
        intro="Sign-in, passkeys and encrypted cross-device autosave."
      />

      <Card>
      <CardHead title="Account and autosave" detail={syncStatus || "Encrypted snapshot of your training data"} />
      {status?.signedIn ? (
        // `.account-identity` is the avatar-plus-name row inside the card, not
        // the card itself — it lays its children out in a flex row.
        <div className="account-identity">
          {status.user?.image ? (
            <img src={status.user.image} alt="" />
          ) : (
            <span>{(status.user?.name || "A").slice(0, 1).toUpperCase()}</span>
          )}
          <div>
            <strong>{status.user?.name || "Athlete"}</strong>
            <small>{status.user?.email || ""}</small>
          </div>
        </div>
      ) : (
        <div>
          <p className="muted">Not signed in.</p>
          {/* `.cloud-actions` is the prototype's button row — without it these
              sit as two full-width blocks with a stray text node between. */}
          <div className="cloud-actions">
            {/* Through runAuth like the passkey button: starting sign-in is a
                request that can fail, and it used to fail silently. */}
            <button
              type="button"
              className="btn btn-dark"
              disabled={authBusy !== ""}
              onClick={() => runAuth("google-signin", signInWithGoogle)}
            >
              {authBusy === "google-signin" ? "Opening Google…" : "Continue with Google"}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              disabled={!passkeysSupported() || authBusy !== ""}
              onClick={() => runAuth("passkey-signin", signInWithPasskey)}
            >
              {passkeysSupported() ? "Use Face ID, Touch ID or passkey" : "Passkeys unavailable on this browser"}
            </button>
          </div>
          <p className="fineprint">
            First time: sign in with Google, then add a passkey below. Your face or fingerprint stays
            on your device and is never sent to Pitching OS.
          </p>
        </div>
      )}

      {status?.signedIn && !status.workspaceReady && status.needsInvite && (
        <div className="form-grid">
          <div className="field full">
            <label htmlFor="inviteCode">Invite code</label>
            <input
              id="inviteCode"
              type="text"
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="From your invite link"
              value={invite}
              onChange={(event) => setInvite(event.target.value)}
            />
            <small>Accounts are invite-only. Opening your invite link fills this in.</small>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-dark" disabled={busy || !invite.trim()} onClick={createWorkspace}>
              {busy ? "Joining…" : "Join"}
            </button>
          </div>
        </div>
      )}

      {status?.signedIn && !status.workspaceReady && !status.needsInvite && (
        <div className="cloud-actions">
          <button type="button" className="btn btn-dark" disabled={busy} onClick={createWorkspace}>
            {busy ? "Setting up…" : "Set up cloud workspace"}
          </button>
        </div>
      )}
      </Card>

      {status?.signedIn && (
        <Card>
          <CardHead
            title="Passkeys"
            detail={`${passkeys.length} passkey${passkeys.length === 1 ? "" : "s"} registered`}
          />
          {passkeys.length > 0 && (
            <ul className="task-list">
              {passkeys.map((passkey) => (
                <TaskRow
                  key={passkey.id}
                  title={passkey.name || "Passkey"}
                  detail={passkey.createdAt ? `Added ${passkey.createdAt}` : undefined}
                  actions={
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={authBusy !== ""}
                      onClick={() => runAuth("delete-passkey", () => deletePasskey(passkey.id))}
                    >
                      Remove
                    </button>
                  }
                />
              ))}
            </ul>
          )}
          <div className="cloud-actions">
            <button
              type="button"
              className="btn btn-outline"
              disabled={!passkeysSupported() || authBusy !== ""}
              onClick={() => runAuth("add-passkey", registerPasskey)}
            >
              {authBusy === "add-passkey"
                ? "Waiting for your device…"
                : passkeys.length
                  ? "Add another passkey"
                  : "Add Face ID / passkey"}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              disabled={authBusy !== ""}
              onClick={() =>
                runAuth("sign-out", async () => {
                  await signOut();
                  await onSignedOut?.();
                })
              }
            >
              Sign out
            </button>
          </div>
        </Card>
      )}

      <Card className="cloud-card">
      <CardHead title="Recovery key" detail="Held on this device only" />
      <p className="fineprint">
        Your data is encrypted on this device before it is uploaded. This key is what decrypts it —
        the server never sees it. Without it, a cloud backup cannot be recovered.
      </p>

      {syncKey ? (
        <div className="setup-secret">
          <code>{revealKey ? syncKey : "•".repeat(32)}</code>
          <button type="button" className="btn btn-outline" onClick={() => setRevealKey((value) => !value)}>
            {revealKey ? "Hide" : "Show"}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => navigator.clipboard?.writeText(syncKey)}>
            Copy
          </button>
        </div>
      ) : (
        <p className="fineprint">No recovery key on this device — cloud autosave is off.</p>
      )}

      <div className="form-grid">
        <Field id="manualKey" label="Use an existing key" hint="64 hexadecimal characters" full>
          <input
            id="manualKey"
            type="text"
            value={manualKey}
            placeholder="64-character recovery key"
            onChange={(event) => setManualKey(event.target.value)}
          />
        </Field>
        <div className="form-actions cloud-actions">
          <button type="button" className="btn btn-outline" onClick={useManualKey}>
            Use this key
          </button>
          <button type="button" className="btn btn-dark" disabled={!syncKey} onClick={onSyncNow}>
            Sync now
          </button>
        </div>
      </div>
      {syncStatus && <p className="fineprint">{syncStatus}</p>}
      </Card>

      {status?.isOwner && status.workspaceReady && <InvitesCard api={api} />}

      {onReplaceState && <DataBackup state={state ?? null} onReplace={onReplaceState} />}

      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}
    </>
  );
}
