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

// ------------------------------------------------------------------ output
console.log(`\n${passed}/${passed + failed} passed`);
await shutdown(failed === 0 ? 0 : 1);
