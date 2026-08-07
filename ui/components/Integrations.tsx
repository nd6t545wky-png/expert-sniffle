import { useCallback, useEffect, useState } from "react";
import { PitchingOsApi } from "../../src/domain/api";
import { Alert, Card, PageHead } from "./Page";

/**
 * Oura and Apple Health.
 *
 * Oura is OAuth: the server hands back an authorize URL to redirect to.
 * Apple Health is a bearer-token upload endpoint driven by an iPhone
 * Shortcut, so the token is shown once and never stored here.
 */

export interface IntegrationsProps {
  api: PitchingOsApi;
  hasSyncKey: boolean;
}

interface OuraStatus {
  configured: boolean;
  connected: boolean;
  scopes: string;
  updatedAt: string;
}

interface AppleStatus {
  connected: boolean;
  createdAt: string;
  lastUploadAt: string;
}

export function Integrations({ api, hasSyncKey }: IntegrationsProps) {
  const [oura, setOura] = useState<OuraStatus | null>(null);
  const [apple, setApple] = useState<AppleStatus | null>(null);
  const [uploadToken, setUploadToken] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const refresh = useCallback(async () => {
    if (!hasSyncKey) return;
    try {
      const [ouraStatus, appleStatus] = await Promise.all([api.ouraStatus(), api.appleStatus()]);
      setOura(ouraStatus);
      setApple(appleStatus);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [api, hasSyncKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy("");
    }
  }

  if (!hasSyncKey) {
    return (
      <>
        <PageHead eyebrow="Connections" title="Wearables and health data." />
        <Alert>Turn on cloud autosave before connecting Oura or Apple Health.</Alert>
      </>
    );
  }

  return (
    <>
      <PageHead
        eyebrow="Connections"
        title="Wearables and health data."
        intro="Readiness improves when it can see sleep, HRV and resting heart rate."
      />

      <Card className="integration">
        <div className="integration-icon" aria-hidden="true">
          ◎
        </div>
        <div>
          <h3>Oura</h3>
          <p>{oura?.connected ? `Connected${oura.updatedAt ? ` — updated ${oura.updatedAt}` : ""}` : "Not connected"}</p>
          {oura && !oura.configured && (
            <p className="fineprint">Oura application credentials have not been added to this deployment yet.</p>
          )}
        </div>
        <div className="integration-actions">
      {oura?.connected ? (
        <button
          type="button"
          className="btn btn-outline"
          disabled={busy !== ""}
          onClick={() => run("oura-disconnect", async () => {
            await api.ouraDisconnect();
            await refresh();
          })}
        >
          {busy === "oura-disconnect" ? "Disconnecting…" : "Disconnect Oura"}
        </button>
      ) : (
        <button
          type="button"
          className="btn"
          disabled={busy !== "" || !oura?.configured}
          onClick={() => run("oura-connect", async () => {
            const { authorizeUrl } = await api.ouraConnect();
            window.location.href = authorizeUrl;
          })}
        >
          {busy === "oura-connect" ? "Opening…" : "Connect Oura"}
        </button>
      )}
        </div>
      </Card>

      <Card className="integration">
        <div className="integration-icon" aria-hidden="true">
          􀆿
        </div>
        <div>
          <h3>Apple Health</h3>
          <p>
            {apple?.connected
              ? `Connected${apple.lastUploadAt ? ` — last upload ${apple.lastUploadAt}` : " — no uploads yet"}`
              : "Not connected"}
          </p>
        </div>
        <div className="integration-actions">
      <button
        type="button"
        className="btn"
        disabled={busy !== ""}
        onClick={() => run("apple-setup", async () => {
          const result = await api.appleSetup();
          setUploadToken(result.uploadToken);
          setEndpoint(result.endpoint);
          await refresh();
        })}
      >
        {busy === "apple-setup" ? "Generating…" : apple?.connected ? "Regenerate upload token" : "Set up Apple Health"}
      </button>
      {apple?.connected && (
        <button
          type="button"
          className="btn btn-outline"
          disabled={busy !== ""}
          onClick={() => run("apple-disconnect", async () => {
            await api.appleDisconnect();
            setUploadToken("");
            await refresh();
          })}
        >
          {busy === "apple-disconnect" ? "Disconnecting…" : "Disconnect"}
        </button>
      )}
        </div>
      </Card>

      {uploadToken && (
        <Alert tone="warn">
          <strong>This token is shown once.</strong>
          <p>Paste it into your iPhone Shortcut now — it cannot be retrieved again, only replaced.</p>
          <div className="setup-secret">
            <span>Upload address</span>
            <code>{endpoint}</code>
          </div>
          <div className="setup-secret">
            <span>Private upload key</span>
            <code>{uploadToken}</code>
            <button type="button" className="btn btn-outline" onClick={() => navigator.clipboard?.writeText(uploadToken)}>
              Copy
            </button>
          </div>
          <button type="button" className="btn btn-outline" onClick={() => setUploadToken("")}>
            I've saved it
          </button>
        </Alert>
      )}

      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}
    </>
  );
}
