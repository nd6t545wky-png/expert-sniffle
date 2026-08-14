/**
 * Ask production what it is running, and compare it to this build.
 *
 * Production is one Worker, anyone with the Cloudflare account can deploy to
 * it, and the last deploy wins with no error and no notice. That happened:
 * a different codebase was deployed over this one and the app appeared to
 * revert to an old design. Establishing what had actually happened meant
 * reading Cloudflare's deployment list and diffing files by hand, because
 * nothing served by the site could say which commit it came from.
 *
 * Now it can. `npm run build` writes dist/build.json — the commit, whether
 * that commit's tree was clean, and the SHA-256 of every file shipped — and
 * this script fetches the deployed copy and compares them.
 *
 * Run it after a deploy, or any time the app looks wrong:
 *
 *     npm run verify:live
 *
 * Exit code 0 means production is running this build. Anything else names
 * what differs, which is the difference between "the app is broken" and
 * "the app is not the one you think it is".
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const ORIGIN = process.env.APP_ORIGIN || "https://dylan-pitching-os.tourmaline-goldfish.workers.dev";

function fail(message, detail = "") {
  console.log(`MISMATCH  ${message}${detail ? `\n          ${detail}` : ""}`);
  return 1;
}

const local = JSON.parse(await readFile(path.join(root, "dist", "build.json"), "utf8"));

/**
 * Read the deployed manifest once.
 *
 * Returns the parsed manifest, or a reason it could not be read. A 200 that
 * is not JSON is not a transport error — it is the signature of the failure
 * this script exists for, an unknown path answered with an app shell.
 */
async function readRemote() {
  // A query string the edge has not seen before: a cached copy of the manifest
  // would defeat the entire point of asking.
  const url = `${ORIGIN}/build.json?at=${Date.now()}`;
  const response = await fetch(url, { headers: { "Cache-Control": "no-cache" } });
  if (!response.ok) {
    return {
      problem: `${ORIGIN} has no build manifest (HTTP ${response.status}).`,
      detail: "Production is running a build that predates this check, or a different codebase.",
    };
  }
  const text = await response.text();
  try {
    return { manifest: JSON.parse(text) };
  } catch {
    return {
      problem: `${ORIGIN} answered /build.json with ${response.status} but did not return JSON.`,
      detail:
        `It served ${text.trim().slice(0, 40).replace(/\s+/g, " ")}… — a build with no manifest, ` +
        "so a different codebase, or one deployed before this check existed.",
    };
  }
}

/**
 * Wait for the edge to catch up before calling it a mismatch.
 *
 * A deploy is not instantaneous and Cloudflare will serve the previous copy
 * for a few seconds afterwards. Reporting that as "production is running a
 * different build" would make this check cry wolf on every single deploy,
 * which is how a guard gets ignored and then removed. So a disagreement is
 * retried for a minute, and only a *persistent* one is reported. A match is
 * returned the moment it happens, so the usual case stays quick.
 */
const DEADLINE_MS = 60_000;
const RETRY_MS = 3_000;

let remote = null;
let lastProblem = null;
const started = Date.now();
let waited = false;

while (Date.now() - started < DEADLINE_MS) {
  let attempt;
  try {
    attempt = await readRemote();
  } catch (error) {
    attempt = { problem: `could not reach ${ORIGIN}: ${error.message}`, transport: true };
  }

  if (attempt.manifest && attempt.manifest.commit === local.commit) {
    remote = attempt.manifest;
    break;
  }
  remote = attempt.manifest ?? remote;
  lastProblem = attempt.problem ? attempt : lastProblem;

  if (Date.now() - started + RETRY_MS >= DEADLINE_MS) break;
  if (!waited) {
    waited = true;
    process.stdout.write("waiting for the edge to serve the new build");
  }
  process.stdout.write(".");
  await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
}
if (waited) process.stdout.write("\n");

if (!remote) {
  console.log(`MISMATCH  ${lastProblem?.problem ?? "no manifest could be read."}`);
  if (lastProblem?.detail) console.log(`          ${lastProblem.detail}`);
  process.exit(lastProblem?.transport ? 2 : 1);
}

let problems = 0;

if (remote.commit !== local.commit) {
  problems += fail(
    "production is running a different commit.",
    `local ${local.commit.slice(0, 12)} · live ${String(remote.commit).slice(0, 12)}`
  );
}

// Compare every file both sides claim to have, and say plainly which side is
// missing what — a dropped directory is the failure that started all this.
const localFiles = local.files || {};
const remoteFiles = remote.files || {};
const missing = Object.keys(localFiles).filter((name) => !(name in remoteFiles));
const extra = Object.keys(remoteFiles).filter((name) => !(name in localFiles));
const differing = Object.keys(localFiles).filter(
  (name) => name in remoteFiles && remoteFiles[name] !== localFiles[name]
);

if (missing.length) {
  problems += fail(`${missing.length} file(s) in this build are not deployed.`, missing.slice(0, 8).join(", "));
}
if (extra.length) {
  problems += fail(`${extra.length} deployed file(s) are not in this build.`, extra.slice(0, 8).join(", "));
}
if (differing.length) {
  problems += fail(`${differing.length} deployed file(s) differ in content.`, differing.slice(0, 8).join(", "));
}

if (!local.cleanTree) {
  console.log("WARNING   this build came from a dirty tree, so the commit does not fully describe it.");
}

if (problems === 0) {
  console.log(
    `OK        ${ORIGIN} is running this build ` +
      `(${local.commit.slice(0, 8)}, ${local.fileCount} files, built ${local.builtAt}).`
  );
  process.exit(0);
}

console.log(`\n${problems} problem(s). Production is not running this build.`);
process.exit(1);
