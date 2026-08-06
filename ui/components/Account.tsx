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
  onSyncNow: () => void;
  syncStatus: string;
}

interface Status {
  signedIn: boolean;
  workspaceReady: boolean;
  user?: { name: string; email: string; image: string };
  syncKey?: string;
}

export function Account({ api, syncKey, onSyncKey, onSyncNow, syncStatus }: AccountProps) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [manualKey, setManualKey] = useState("");
  const [revealKey, setRevealKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [authBusy, setAuthBusy] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .accountStatus()
      .then((result) => {
        if (cancelled) return;
        setStatus(result);
        // A signed-in workspace hands back the sync key; adopt it.
        if (result.syncKey && isValidSyncKey(result.syncKey)) onSyncKey(result.syncKey);
        if (result.signedIn) listPasskeys().then(setPasskeys).catch(() => setPasskeys([]));
      })
      .catch((cause) => !cancelled && setError(cause.message));
    return () => {
      cancelled = true;
    };
  }, [api, onSyncKey]);

  async function createWorkspace() {
    setBusy(true);
    setError("");
    try {
      // Adopt an existing local recovery key so device data is not stranded.
      const result = await api.createWorkspace(isValidSyncKey(syncKey) ? syncKey : undefined);
      onSyncKey(result.syncKey);
      setStatus((current) => (current ? { ...current, workspaceReady: true } : current));
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
    <section className="card" aria-labelledby="account-heading">
      <h2 id="account-heading">Account &amp; cloud sync</h2>

      {status?.signedIn ? (
        <p className="muted">
          Signed in as <strong>{status.user?.name || status.user?.email}</strong>
        </p>
      ) : (
        <div>
          <p className="muted">Not signed in.</p>
          <button type="button" className="btn" onClick={signInWithGoogle}>
            Continue with Google
          </button>{" "}
          <button
            type="button"
            className="btn btn-outline"
            disabled={!passkeysSupported() || authBusy !== ""}
            onClick={() => runAuth("passkey-signin", signInWithPasskey)}
          >
            {passkeysSupported() ? "Use Face ID, Touch ID or passkey" : "Passkeys unavailable on this browser"}
          </button>
          <p className="fineprint">
            First time: sign in with Google, then add a passkey below. Your face or fingerprint stays
            on your device and is never sent to Pitching OS.
          </p>
        </div>
      )}

      {status?.signedIn && !status.workspaceReady && (
        <button type="button" className="btn" disabled={busy} onClick={createWorkspace}>
          {busy ? "Setting up…" : "Set up cloud workspace"}
        </button>
      )}

      {status?.signedIn && (
        <>
          <h3>Passkeys</h3>
          <p className="muted">
            {passkeys.length} passkey{passkeys.length === 1 ? "" : "s"} registered.
          </p>
          {passkeys.length > 0 && (
            <ul className="task-list">
              {passkeys.map((passkey) => (
                <li key={passkey.id} className="task">
                  <div>
                    <strong>{passkey.name || "Passkey"}</strong>
                    {passkey.createdAt && <span className="muted"> added {passkey.createdAt}</span>}
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={authBusy !== ""}
                    onClick={() => runAuth("delete-passkey", () => deletePasskey(passkey.id))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
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
          </button>{" "}
          <button
            type="button"
            className="btn btn-outline"
            disabled={authBusy !== ""}
            onClick={() => runAuth("sign-out", signOut)}
          >
            Sign out
          </button>
        </>
      )}

      <h3>Recovery key</h3>
      <p className="muted">
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
        <p className="muted">No recovery key on this device — cloud autosave is off.</p>
      )}

      <h3>Use an existing key</h3>
      <input
        type="text"
        value={manualKey}
        placeholder="64-character recovery key"
        onChange={(event) => setManualKey(event.target.value)}
      />
      <button type="button" className="btn btn-outline" onClick={useManualKey}>
        Use this key
      </button>

      <h3>Sync</h3>
      <button type="button" className="btn" disabled={!syncKey} onClick={onSyncNow}>
        Sync now
      </button>
      {syncStatus && <p className="muted">{syncStatus}</p>}

      {error && (
        <div className="alert danger" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
