/**
 * The Worker, tested by running it.
 *
 * `src/index.ts` is the largest file in the repository and holds every API
 * endpoint, the account auth, the encrypted sync layer, private media in R2
 * and the third-party integrations. Until this file existed, none of it was
 * covered: the other e2e suites serve `dist/` as static files and stub every
 * `/api/*` route, and the unit tests run in jsdom where the Worker cannot be
 * loaded at all. The code holding the athlete's data was the only code with
 * no tests.
 *
 * This runs the real thing. `wrangler dev --local` builds the Worker through
 * the same esbuild path as a deploy and serves it on workerd with local D1 and
 * R2, so what is exercised here is the artefact that ships, not a
 * reimplementation of it. The database is built from `migrations/`, which is
 * also new — the schema previously existed only inside the production D1.
 *
 * Deliberately not covered: anything that would call Workers AI or a real
 * third-party API. Those need network and credentials, and a test that needs
 * a live Oura account is a test nobody runs.
 */

import { spawn } from "node:child_process";
import { once } from "node:events";

const PORT = 8788;
const BASE = `http://127.0.0.1:${PORT}`;
// The Worker treats a localhost request's own origin as the app origin, so
// against `wrangler dev` this is what "same origin" means. Production uses
// APP_ORIGIN from wrangler.jsonc instead.
const ORIGIN = BASE;

let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** A 64-hex recovery key. Each test that needs isolation makes its own. */
function recoveryKey() {
  return Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
}

function api(path, { key, method = "GET", body, headers = {} } = {}) {
  return fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function waitForReady(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/api/account/status`);
      if (response.status < 500) return true;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

const worker = spawn(
  "npx",
  ["wrangler", "dev", "--local", "--port", String(PORT), "--inspector-port", "9339"],
  { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } }
);
const workerLog = [];
worker.stdout.on("data", (chunk) => workerLog.push(String(chunk)));
worker.stderr.on("data", (chunk) => workerLog.push(String(chunk)));

async function shutdown(code) {
  worker.kill("SIGTERM");
  await Promise.race([once(worker, "exit"), new Promise((r) => setTimeout(r, 4000))]);
  process.exit(code);
}

if (!(await waitForReady())) {
  console.log("FAIL  wrangler dev never became ready");
  console.log(workerLog.join("").slice(-2000));
  await shutdown(1);
}

// ------------------------------------------------------------------ auth
{
  const noKey = await api("/api/sync");
  check("sync refuses a request with no recovery key", noKey.status === 401, `got ${noKey.status}`);

  const shortKey = await api("/api/sync", { key: "abc123" });
  check("sync refuses a malformed recovery key", shortKey.status === 401, `got ${shortKey.status}`);

  const notHex = await api("/api/sync", { key: "z".repeat(64) });
  check("sync refuses a 64-character non-hex key", notHex.status === 401, `got ${notHex.status}`);

  const history = await api("/api/history");
  check("history refuses a request with no recovery key", history.status === 401, `got ${history.status}`);
}

// -------------------------------------------------------- snapshot round trip
{
  const key = recoveryKey();

  const empty = await api("/api/sync", { key });
  const emptyBody = await empty.json();
  check(
    "an unknown key has no snapshot, and says so rather than erroring",
    empty.status === 200 && emptyBody.found === false && emptyBody.revision === 0,
    JSON.stringify(emptyBody)
  );

  const created = await api("/api/sync", {
    key,
    method: "PUT",
    body: { payload: "encrypted-payload-one", expectedRevision: 0 },
  });
  const createdBody = await created.json();
  check(
    "a first save is accepted and starts at revision 1",
    created.status === 200 && createdBody.saved === true && createdBody.revision === 1,
    JSON.stringify(createdBody)
  );

  const read = await api("/api/sync", { key });
  const readBody = await read.json();
  check(
    "the saved payload reads back exactly",
    readBody.found === true && readBody.payload === "encrypted-payload-one" && readBody.revision === 1,
    JSON.stringify(readBody)
  );

  const updated = await api("/api/sync", {
    key,
    method: "PUT",
    body: { payload: "encrypted-payload-two", expectedRevision: 1 },
  });
  const updatedBody = await updated.json();
  check(
    "a save against the current revision moves it forward",
    updated.status === 200 && updatedBody.revision === 2,
    JSON.stringify(updatedBody)
  );

  // The property that stops one device silently overwriting another.
  const stale = await api("/api/sync", {
    key,
    method: "PUT",
    body: { payload: "written-from-a-stale-device", expectedRevision: 1 },
  });
  const staleBody = await stale.json();
  check(
    "a save against a stale revision is refused, not applied",
    stale.status === 409 && staleBody.code === "sync_conflict" && staleBody.currentRevision === 2,
    JSON.stringify(staleBody)
  );

  const afterConflict = await api("/api/sync", { key });
  const afterBody = await afterConflict.json();
  check(
    "the refused save did not change what was stored",
    afterBody.payload === "encrypted-payload-two" && afterBody.revision === 2,
    JSON.stringify(afterBody)
  );

  // A second create against an existing key must not wipe it either.
  const recreate = await api("/api/sync", {
    key,
    method: "PUT",
    body: { payload: "pretending-this-is-a-new-workspace", expectedRevision: 0 },
  });
  check("a fresh-workspace save cannot overwrite an existing one", recreate.status === 409, `got ${recreate.status}`);
  const survived = await (await api("/api/sync", { key })).json();
  check("the existing workspace survived that attempt", survived.payload === "encrypted-payload-two");
}

// ------------------------------------------------------------------ isolation
{
  const mine = recoveryKey();
  const theirs = recoveryKey();
  await api("/api/sync", { key: mine, method: "PUT", body: { payload: "my-private-workspace", expectedRevision: 0 } });

  const other = await (await api("/api/sync", { key: theirs })).json();
  check(
    "one recovery key cannot read another's snapshot",
    other.found === false,
    JSON.stringify(other)
  );

  // Deleting one workspace must not touch the other.
  await api("/api/sync", { key: theirs, method: "PUT", body: { payload: "their-workspace-here", expectedRevision: 0 } });
  const deleted = await api("/api/sync", { key: theirs, method: "DELETE" });
  check("a workspace can be deleted", deleted.status === 200, `got ${deleted.status}`);
  const gone = await (await api("/api/sync", { key: theirs })).json();
  check("the deleted workspace is really gone", gone.found === false);
  const untouched = await (await api("/api/sync", { key: mine })).json();
  check("deleting one workspace left the other alone", untouched.payload === "my-private-workspace");
}

// ------------------------------------------------------------------ validation
{
  const key = recoveryKey();

  const short = await api("/api/sync", { key, method: "PUT", body: { payload: "tooshort", expectedRevision: 0 } });
  check("a payload below the minimum length is rejected", short.status === 400, `got ${short.status}`);

  const negative = await api("/api/sync", {
    key,
    method: "PUT",
    body: { payload: "a-perfectly-fine-payload", expectedRevision: -1 },
  });
  check("a negative expected revision is rejected", negative.status === 400, `got ${negative.status}`);

  const fractional = await api("/api/sync", {
    key,
    method: "PUT",
    body: { payload: "a-perfectly-fine-payload", expectedRevision: 1.5 },
  });
  check("a fractional expected revision is rejected", fractional.status === 400, `got ${fractional.status}`);

  const wrongType = await api("/api/sync", {
    key,
    method: "PUT",
    body: { payload: { not: "a string" }, expectedRevision: 0 },
  });
  check("a non-string payload is rejected", wrongType.status === 400, `got ${wrongType.status}`);

  const garbage = await fetch(`${BASE}/api/sync`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: "{ this is not json",
  });
  check("a body that is not JSON is rejected, not crashed on", garbage.status === 400, `got ${garbage.status}`);

  // Genuinely oversized, rather than a fake Content-Length: the header has to
  // match the body or the request never leaves the client, and it is the real
  // size the Worker is meant to refuse.
  const oversize = await api("/api/sync", {
    key,
    method: "PUT",
    body: { payload: "x".repeat(800_000), expectedRevision: 0 },
  });
  check("an oversized payload is refused before it is parsed", oversize.status === 413, `got ${oversize.status}`);

  // Just under the cap must still be accepted, or the limit is a bug.
  const large = await api("/api/sync", {
    key,
    method: "PUT",
    body: { payload: "x".repeat(700_000), expectedRevision: 0 },
  });
  check("a large but legal payload is accepted", large.status === 200, `got ${large.status}`);

  const wrongMethod = await api("/api/sync", { key, method: "PATCH" });
  check("an unsupported method is refused", wrongMethod.status === 405, `got ${wrongMethod.status}`);
}

// ------------------------------------------------------------- cross-origin
{
  const key = recoveryKey();
  const blocked = await api("/api/sync", {
    key,
    headers: { Origin: "https://evil.example" },
  });
  check("a cross-origin request is blocked", blocked.status === 403, `got ${blocked.status}`);

  const sameOrigin = await api("/api/sync", { key, headers: { Origin: ORIGIN } });
  check("the app's own origin is allowed", sameOrigin.status === 200, `got ${sameOrigin.status}`);

  // A request with no Origin at all (a Shortcut, curl, the app's own fetch on
  // some browsers) must not be treated as cross-origin.
  const noOrigin = await api("/api/sync", { key });
  check("a request with no Origin header is not blocked", noOrigin.status === 200, `got ${noOrigin.status}`);
}

// ------------------------------------------------------------------ headers
{
  const response = await api("/api/sync", { key: recoveryKey() });
  const header = (name) => (response.headers.get(name) || "").toLowerCase();
  check("API responses are never stored by a cache", header("cache-control").includes("no-store"), header("cache-control"));
  check("API responses cannot be sniffed into another type", header("x-content-type-options") === "nosniff");
  check("API responses cannot be framed", header("x-frame-options") === "deny");
  check("API responses send no referrer", header("referrer-policy") === "no-referrer");
  check("API responses are same-origin only", header("cross-origin-resource-policy") === "same-origin");
  check("API responses carry HSTS", header("strict-transport-security").includes("max-age="));
}

// ------------------------------------------------------------ history events
{
  const key = recoveryKey();

  const unknownType = await api("/api/history", {
    key,
    method: "POST",
    body: {
      events: [
        {
          id: "abcdefghijkl",
          eventType: "not_a_real_event_type",
          sessionDay: "2026-08-14",
          occurredAt: "2026-08-14T00:00:00.000Z",
          encryptedPayload: "x".repeat(64),
        },
      ],
    },
  });
  check("an unknown history event type is refused", unknownType.status === 400, `got ${unknownType.status}`);

  const badDay = await api("/api/history", {
    key,
    method: "POST",
    body: {
      events: [
        {
          id: "abcdefghijkl",
          eventType: "task_completion",
          sessionDay: "14-08-2026",
          occurredAt: "2026-08-14T00:00:00.000Z",
          encryptedPayload: "x".repeat(64),
        },
      ],
    },
  });
  check("a malformed session day is refused", badDay.status === 400, `got ${badDay.status}`);

  const badRange = await api("/api/history?start=2026-12-01&end=2026-01-01", { key });
  check("a history range that ends before it starts is refused", badRange.status === 400, `got ${badRange.status}`);

  const halfCursor = await api("/api/history?after=2026-08-14T00:00:00.000Z", { key });
  check("half a pagination cursor is refused rather than guessed", halfCursor.status === 400, `got ${halfCursor.status}`);
}

// ------------------------------------------------------- integration guards
{
  const ingest = await fetch(`${BASE}/api/integrations/apple/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ day: "2026-08-14", steps: 1000 }),
  });
  check("Apple ingest refuses a request with no upload token", ingest.status === 401 || ingest.status === 400, `got ${ingest.status}`);

  const appleStatus = await api("/api/integrations/apple/status");
  check("Apple status refuses an unauthenticated caller", appleStatus.status === 401, `got ${appleStatus.status}`);

  const ouraStatus = await api("/api/integrations/oura/status");
  check("Oura status refuses an unauthenticated caller", ouraStatus.status === 401, `got ${ouraStatus.status}`);

  const badState = await fetch(`${BASE}/api/integrations/oura/callback?state=nope&code=whatever`, {
    redirect: "manual",
  });
  check(
    "an Oura callback with an invalid state is sent away, not processed",
    badState.status === 302,
    `got ${badState.status}`
  );
}

// -------------------------------------------------------- rate limiting
{
  // The Workers Rate Limiting binding is configured the documented way and
  // enforces exactly as specified here, under wrangler dev. Against the
  // deployed Worker it does not enforce at all — 90 sequential requests to
  // this 60-per-minute endpoint returned zero 429s — which is why the count
  // that decides now lives in D1. This checks the endpoint refuses, whichever
  // layer does the refusing.
  const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
  const hit = () =>
    fetch(`${BASE}/api/integrations/apple/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
      body: JSON.stringify({ day: "2026-08-14", steps: 1 }),
    });

  const codes = [];
  for (let i = 0; i < 70; i += 1) codes.push((await hit()).status);

  const refused = codes.filter((code) => code === 429).length;
  const allowed = codes.filter((code) => code !== 429).length;
  check("the ingest endpoint refuses once the limit is passed", refused > 0, `${refused} refusals in 70`);
  check(
    "it refuses only after the limit, not before",
    allowed === 60,
    `${allowed} allowed, expected the configured 60`
  );

  // A limit that is not scoped to the caller is a denial of service.
  const otherIp = await fetch(`${BASE}/api/integrations/apple/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "198.51.100.254" },
    body: JSON.stringify({ day: "2026-08-14", steps: 1 }),
  });
  check("one caller hitting the limit does not block another", otherIp.status !== 429, `got ${otherIp.status}`);
}

// --------------------------------------------------------- the front door
{
  const html = { Accept: "text/html,application/xhtml+xml,*/*" };

  // Everything built since the rebuild lives at /next/, and the prototype at /
  // contains no link to it. Opening the site gave the old app, so deployed and
  // verified work was invisible — it read as the app having reverted.
  const root = await fetch(`${BASE}/`, { headers: html, redirect: "manual" });
  check("opening the site sends you to the rebuilt app", root.status === 302, `got ${root.status}`);
  check(
    "and sends you to /next/ specifically",
    (root.headers.get("location") || "").endsWith("/next/"),
    root.headers.get("location") || "(no location)"
  );

  // The Oura callback comes back with its outcome on the query string.
  const withQuery = await fetch(`${BASE}/?page=integrations&oura=connected`, {
    headers: html,
    redirect: "manual",
  });
  check(
    "the query string survives the redirect",
    (withQuery.headers.get("location") || "").includes("oura=connected"),
    withQuery.headers.get("location") || "(no location)"
  );

  // The prototype is not deleted, and stays reachable on purpose.
  const legacy = await fetch(`${BASE}/?legacy=1`, { headers: html, redirect: "manual" });
  const legacyBody = legacy.status === 200 ? await legacy.text() : "";
  check("the prototype is still reachable", legacy.status === 200, `got ${legacy.status}`);
  check(
    "and it is the prototype, not the rebuilt app",
    legacyBody.includes("/app.js") && !/\/next\/assets\/index-/.test(legacyBody),
    legacyBody.slice(0, 80)
  );

  // A redirect must not be handed to something that asked for data.
  const probe = await fetch(`${BASE}/`, { headers: { Accept: "application/json" }, redirect: "manual" });
  check("a non-browser request for / is not redirected", probe.status === 200, `got ${probe.status}`);

  const manifest = await (await fetch(`${BASE}/manifest.webmanifest`)).json();
  check(
    "the installed app opens the rebuilt app too",
    manifest.start_url === "/next/",
    String(manifest.start_url)
  );
}

// ------------------------------------------------------- assets and 404s
{
  // The behaviour that hid a total outage. With
  // not_found_handling: "single-page-application", every one of these missing
  // paths answered 200 with the old index.html, so a deploy that dropped the
  // React app looked exactly like a working deploy.
  const html = { Accept: "text/html,application/xhtml+xml,*/*" };

  const shell = await fetch(`${BASE}/`, { headers: html });
  check("the root shell is served", shell.status === 200, `got ${shell.status}`);

  const nextShell = await fetch(`${BASE}/next/`, { headers: html });
  const nextBody = await nextShell.text();
  check("the React shell is served at /next/", nextShell.status === 200, `got ${nextShell.status}`);
  check(
    "/next/ serves the React shell, not the prototype",
    /\/next\/assets\/index-[A-Za-z0-9_-]+\.js/.test(nextBody),
    nextBody.slice(0, 120)
  );

  const missingScript = await fetch(`${BASE}/domain.js`, { headers: html });
  check(
    "a missing script is a 404, not the app shell with a 200",
    missingScript.status === 404,
    `got ${missingScript.status}`
  );

  const missingBundle = await fetch(`${BASE}/next/assets/does-not-exist.js`, { headers: html });
  check(
    "a missing bundle is a 404, so a broken deploy announces itself",
    missingBundle.status === 404,
    `got ${missingBundle.status}`
  );

  const missingStyle = await fetch(`${BASE}/styles-that-are-not-here.css`, { headers: html });
  check("a missing stylesheet is a 404", missingStyle.status === 404, `got ${missingStyle.status}`);

  // A route still has to work, or the fix has broken deep links.
  const route = await fetch(`${BASE}/some-client-route`, { headers: html });
  check("an extensionless route still gets a shell", route.status === 200, `got ${route.status}`);

  const nextRoute = await fetch(`${BASE}/next/mechanics`, { headers: html });
  const nextRouteBody = await nextRoute.text();
  check(
    "a /next/ route gets the React shell rather than the prototype",
    nextRoute.status === 200 && /\/next\/assets\/index-[A-Za-z0-9_-]+\.js/.test(nextRouteBody),
    `got ${nextRoute.status}`
  );

  // A fetch() for JSON must never be answered with a page.
  const apiish = await fetch(`${BASE}/not-an-endpoint`, { headers: { Accept: "application/json" } });
  check(
    "a non-navigation request for a missing path is a 404, not HTML",
    apiish.status === 404,
    `got ${apiish.status}`
  );

  const legal = await fetch(`${BASE}/privacy.html`, { headers: html, redirect: "follow" });
  check("the privacy page still resolves", legal.status === 200, `got ${legal.status}`);
}

// ------------------------------------------------------------------ output
console.log(`\n${passed}/${passed + failed} passed`);
await shutdown(failed === 0 ? 0 : 1);
