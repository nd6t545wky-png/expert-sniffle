import { useCallback, useEffect, useState } from "react";
import { PitchingOsApi } from "../../src/domain/api";
import { Alert, Card, PageHead } from "./Page";
import { APPLE_FIELDS } from "../../src/domain/appleHealth";

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

/**
 * What each Oura callback outcome means, in the athlete's words.
 *
 * The Worker redirects back with one of these on the query string. Anything
 * not listed is shown verbatim rather than swallowed — an unknown failure the
 * athlete can read out is more useful than a silent one.
 */
const OURA_CALLBACK_MESSAGES: Record<string, string> = {
  connected: "Oura connected. Last night's data will appear at the next sync.",
  denied: "Oura sign-in was cancelled, so nothing was connected.",
  expired: "That Oura sign-in took too long and expired. Try connecting again.",
  "invalid-state": "That Oura sign-in could not be verified, so it was refused. Try again.",
  failed: "Oura could not complete the connection. Try again.",
};

export function Integrations({ api, hasSyncKey }: IntegrationsProps) {
  const [oura, setOura] = useState<OuraStatus | null>(null);
  const [apple, setApple] = useState<AppleStatus | null>(null);
  const [uploadToken, setUploadToken] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  // What the Oura callback said, read once from the URL it returned to.
  //
  // The provider redirects back with ?oura=connected — or with why it failed.
  // Nothing read it, so a connection that had just been refused looked
  // identical to one that had never been attempted. Read once and cleared
  // from the address bar, so a reload does not keep re-announcing it.
  const [callback, setCallback] = useState<string>("");
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const outcome = params.get("oura");
      if (!outcome) return;
      setCallback(outcome);
      params.delete("oura");
      const search = params.toString();
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${search ? `?${search}` : ""}`
      );
    } catch {
      // No History API is not a reason to fail the page.
    }
  }, []);

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

  return (
    <>
      <PageHead
        eyebrow="Connections"
        title="Wearables and health data."
        intro="Readiness improves when it can see sleep, HRV and resting heart rate."
      />

      {/* The prototype leads this page with autosave, because everything below
          depends on it. Without a key the wearable cards stay on the page and
          say why they are unavailable — an almost-blank page reads as broken
          rather than as a prerequisite that has not been met. */}
      <Card className="integration">
        <div className="integration-icon" aria-hidden="true">
          ☁
        </div>
        <div>
          <h3>Cloudflare encrypted autosave</h3>
          <p>
            {hasSyncKey
              ? "On. Your signed-in account loads the same encrypted snapshot on every device."
              : "Off. Turn this on before connecting Oura or Apple Health."}
          </p>
        </div>
        <div className="integration-actions">
          <span className={`status ${hasSyncKey ? "green" : "yellow"}`}>{hasSyncKey ? "On" : "Off"}</span>
        </div>
      </Card>

      <Card className="integration">
        <div className="integration-icon" aria-hidden="true">
          ◎
        </div>
        <div>
          <h3>Oura</h3>
          <p>
            {!hasSyncKey
              ? "Cloud autosave required"
              : oura?.connected
                ? `Connected${oura.updatedAt ? ` — updated ${oura.updatedAt}` : ""}`
                : "Not connected"}
          </p>
          {oura && !oura.configured && (
            <p className="fineprint">Oura application credentials have not been added to this deployment yet.</p>
          )}
          {callback && (
            <p className="fineprint">{OURA_CALLBACK_MESSAGES[callback] ?? `Oura returned: ${callback}`}</p>
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
          disabled={busy !== "" || !hasSyncKey || !oura?.configured}
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
            {!hasSyncKey
              ? "Cloud autosave required"
              : apple?.connected
                ? `Connected${apple.lastUploadAt ? ` — last upload ${apple.lastUploadAt}` : " — no uploads yet"}`
                : "Not connected"}
          </p>
        </div>
        <div className="integration-actions">
      <button
        type="button"
        className="btn"
        disabled={busy !== "" || !hasSyncKey}
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
            I&apos;ve saved it
          </button>
        </Alert>
      )}

      {/* A token with no recipe is not an integration. Apple keeps Health and
          Fitness data on the device — there is no cloud API to connect to and
          no OAuth to click through — so a Shortcut posting the numbers is the
          only route, and it has to be spelled out to be usable. */}
      <details className="card disclosure-card quiet-disclosure">
        <summary>
          <span>
            <strong>Setting up the Apple Fitness Shortcut</strong>
            <small>What to build on the iPhone, and the exact names to use</small>
          </span>
          <span>Show</span>
        </summary>
        <div className="disclosure-body">
          <p className="fineprint disclosure-intro">
            Apple keeps Health and Fitness data on your phone and watch. There is no account to
            connect and no Apple server to ask, so nothing can pull these numbers — the phone has to
            push them. A Shortcut set to run each morning does that in about a minute of setup.
          </p>

          <ol className="shortcut-steps">
            <li>
              Open <strong>Shortcuts</strong> on the iPhone and make a new shortcut.
            </li>
            <li>
              Add a <strong>Find Health Samples</strong> action for each figure you want — Active
              Energy, Exercise Minutes, Stand Hours, Steps, Resting Heart Rate, Heart Rate
              Variability, Sleep, Weight — set each to <em>Today</em> and to the right total
              (<em>Sum</em> for energy, minutes, hours and steps; <em>Average</em> for heart rate and
              HRV; <em>Latest</em> for weight).
            </li>
            <li>
              Add a <strong>Dictionary</strong> action and put each result under the name in the
              table below. Leave out anything you do not want to send.
            </li>
            <li>
              Add <strong>Get Contents of URL</strong>. Set the address to the upload address above,
              method <strong>POST</strong>, request body <strong>JSON</strong> with the dictionary,
              and one header: <code>Authorization</code> set to{" "}
              <code>Bearer &lt;your upload key&gt;</code>.
            </li>
            <li>
              In the <strong>Automation</strong> tab, run it daily — first thing in the morning, so
              the day is complete before the check-in asks about it.
            </li>
          </ol>

          <div className="scroll-x">
            <table className="pitch-table">
              <thead>
                <tr>
                  <th scope="col">Name to use</th>
                  <th scope="col">What to put in it</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <code>day</code>
                  </td>
                  <td>The date as 2026-08-12. Required — everything else is optional.</td>
                </tr>
                {/* Generated from the same table the Worker validates against,
                    so what this page tells you to send is what it accepts. */}
                {APPLE_FIELDS.map((field) => (
                  <tr key={field.id}>
                    <td>
                      <code>{field.id}</code>
                    </td>
                    <td>{field.describe}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="fineprint">
            Send whatever you have — a payload with only <code>day</code> and{" "}
            <code>activeCalories</code> is fine. Anything missing stays missing rather than being
            recorded as zero. If a figure arrives under a slightly different name the upload still
            works: <code>activeEnergy</code>, <code>exercise</code>, <code>stand</code>,{" "}
            <code>weight</code> and a few others are all understood.
          </p>
        </div>
      </details>

      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}
    </>
  );
}
