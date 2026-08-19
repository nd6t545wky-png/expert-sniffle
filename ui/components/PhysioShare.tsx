/**
 * Creating, refreshing and revoking the link the athlete sends their physio.
 *
 * The link is a capability, so the two secrets are kept apart deliberately:
 *
 *   - the **share id** goes in the path and identifies the row on the server
 *   - the **share key** goes after the `#`, never leaves the browser bar, and
 *     is the only thing that can decrypt the summary
 *
 * The key is stored on this device so a later refresh re-encrypts under the
 * same key and the link the physio already has keeps working. That is the whole
 * point of a refresh: if every update issued a new key, the athlete would have
 * to re-send the link every week and would stop doing it by the second week.
 *
 * Nothing here can be used to write to the workspace. The sync key is never
 * put in a share, and no share endpoint writes to the workspace.
 */

import { useCallback, useEffect, useState } from "react";
import { PitchingOsApi, ShareRecord } from "../../src/domain/api";
import { encryptJsonEnvelope } from "../../src/domain/sync";
import { PhysioSummary, newShareId, newShareKey, shareLink } from "../../src/domain/physioShare";
import { Card, CardHead } from "./Page";
import { ConfirmButton } from "./ConfirmButton";

/** Where the id and key for this device's link live. */
export const SHARE_STORAGE = "dylan-pitching-os-physio-share-v1";

export interface StoredShare {
  id: string;
  key: string;
  label: string;
}

export function readStoredShare(storage: Storage = window.localStorage): StoredShare | null {
  try {
    const raw = storage.getItem(SHARE_STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredShare>;
    if (typeof parsed?.id !== "string" || typeof parsed?.key !== "string") return null;
    return { id: parsed.id, key: parsed.key, label: String(parsed.label ?? "") };
  } catch {
    return null;
  }
}

function writeStoredShare(share: StoredShare | null, storage: Storage = window.localStorage): void {
  try {
    if (share) storage.setItem(SHARE_STORAGE, JSON.stringify(share));
    else storage.removeItem(SHARE_STORAGE);
  } catch {
    // A device with storage blocked can still create a link; it just cannot
    // refresh the same one later. Failing the whole action would be worse.
  }
}

/**
 * Encrypt a summary and push it under an existing id and key.
 *
 * Exported because the app calls it on every cloud sync — the physio should see
 * yesterday's session without the athlete having to remember to press anything.
 */
export async function publishShare(
  api: PitchingOsApi,
  share: StoredShare,
  summary: PhysioSummary
): Promise<void> {
  const payload = await encryptJsonEnvelope(summary, share.key);
  await api.putShare(share.id, payload, share.label);
}

export interface PhysioShareProps {
  api: PitchingOsApi;
  hasSyncKey: boolean;
  /** Built on demand, so a link always carries the current state. */
  buildSummary: () => PhysioSummary;
  origin?: string;
}

export function PhysioShare({ api, hasSyncKey, buildSummary, origin }: PhysioShareProps) {
  const [share, setShare] = useState<StoredShare | null>(() => readStoredShare());
  const [records, setRecords] = useState<ShareRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refreshList = useCallback(() => {
    if (!hasSyncKey) return;
    api
      .listShares()
      .then((response) => setRecords(response.shares ?? []))
      .catch(() => setRecords([]));
  }, [api, hasSyncKey]);

  useEffect(refreshList, [refreshList]);

  const create = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const next: StoredShare = { id: newShareId(), key: newShareKey(), label: "Physio" };
      await publishShare(api, next, buildSummary());
      writeStoredShare(next);
      setShare(next);
      setMessage("Link created. Send the whole link — the part after the # is what opens it.");
      refreshList();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create the link.");
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    if (!share) return;
    setBusy(true);
    setMessage(null);
    try {
      await publishShare(api, share, buildSummary());
      setMessage("Updated. The link your physio already has now shows today.");
      refreshList();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update the link.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await api.deleteShare(id);
      if (share?.id === id) {
        writeStoredShare(null);
        setShare(null);
      }
      setMessage("Revoked. That link now opens nothing.");
      refreshList();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not revoke the link.");
    } finally {
      setBusy(false);
    }
  };

  const link = share ? shareLink(origin ?? window.location.origin, share.id, share.key) : null;

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setMessage("Copying was blocked — select the link above and copy it by hand.");
    }
  };

  const current = records.find((record) => record.id === share?.id);

  return (
    <Card>
      <CardHead
        title="Share with your physio"
        detail="A read-only summary of the last four weeks. No login for them, no write access."
      />

      {!hasSyncKey ? (
        <p className="recovery-caveat">
          Turn on cloud autosave first. The link is hosted alongside your workspace, so it needs one to
          live in.
        </p>
      ) : (
        <>
          <p className="recovery-caveat">
            Readiness, soreness, throwing, arm screens and workload — encrypted in your browser under a
            key that only lives in the link. The server hosting it cannot read it, and neither can
            anyone the link is not sent to.
          </p>

          {link && (
            <ul className="share-links">
              <li>
                <span className="share-link-value">{link}</span>
                <span className="share-link-meta">
                  {current
                    ? `Last updated ${new Date(current.updatedAt).toLocaleString()} · expires ${new Date(
                        current.expiresAt
                      ).toLocaleDateString()}`
                    : "Not yet confirmed by the server."}
                </span>
                <span className="share-link-actions">
                  <button className="text-button" type="button" onClick={copy}>
                    {copied ? "Copied" : "Copy link"}
                  </button>
                  <button className="text-button" type="button" onClick={refresh} disabled={busy}>
                    Update now
                  </button>
                  <ConfirmButton
                    label="Revoke"
                    describe="this physio link"
                    onConfirm={() => void revoke(share!.id)}
                    disabled={busy}
                  />
                </span>
              </li>
            </ul>
          )}

          {!link && (
            <button className="primary" type="button" onClick={create} disabled={busy}>
              {busy ? "Creating…" : "Create link"}
            </button>
          )}

          {/* Links made on another device, which this one holds no key for. It
              cannot show or refresh them — but it must still be able to turn
              them off, which is the part that matters. */}
          {records.filter((record) => record.id !== share?.id).length > 0 && (
            <>
              <p className="recovery-caveat">Links created on another device:</p>
              <ul className="share-links">
                {records
                  .filter((record) => record.id !== share?.id)
                  .map((record) => (
                    <li key={record.id}>
                      <span className="share-link-meta">
                        {record.label || "Untitled"} · updated{" "}
                        {new Date(record.updatedAt).toLocaleDateString()}
                      </span>
                      <span className="share-link-actions">
                        <ConfirmButton
                          label="Revoke"
                          describe="that link"
                          onConfirm={() => void revoke(record.id)}
                          disabled={busy}
                        />
                      </span>
                    </li>
                  ))}
              </ul>
            </>
          )}

          {message && <p className="recovery-caveat">{message}</p>}
        </>
      )}
    </Card>
  );
}
