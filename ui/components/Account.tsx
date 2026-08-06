import { useEffect, useState } from "react";
import { PitchingOsApi } from "../../src/domain/api";
import { isValidSyncKey, normalizeSyncKey } from "../../src/domain/sync";

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

  useEffect(() => {
    let cancelled = false;
    api
      .accountStatus()
      .then((result) => {
        if (cancelled) return;
        setStatus(result);
        // A signed-in workspace hands back the sync key; adopt it.
        if (result.syncKey && isValidSyncKey(result.syncKey)) onSyncKey(result.syncKey);
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
        <p className="muted">
          Not signed in.{" "}
          <a className="btn btn-outline" href="/api/auth/sign-in/google">
            Sign in with Google
          </a>
        </p>
      )}

      {status?.signedIn && !status.workspaceReady && (
        <button type="button" className="btn" disabled={busy} onClick={createWorkspace}>
          {busy ? "Setting up…" : "Set up cloud workspace"}
        </button>
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
