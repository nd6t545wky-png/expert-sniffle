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

// A query string the edge has not seen before: a cached copy of the manifest
// would defeat the entire point of asking.
const url = `${ORIGIN}/build.json?at=${Date.now()}`;
let remote;
try {
  const response = await fetch(url, { headers: { "Cache-Control": "no-cache" } });
  if (!response.ok) {
    console.log(`MISMATCH  ${ORIGIN} has no build manifest (HTTP ${response.status}).`);
    console.log("          Production is running a build that predates this check, or a different codebase.");
    process.exit(1);
  }
  const text = await response.text();
  try {
    remote = JSON.parse(text);
  } catch {
    // A 200 that is not JSON is the signature of the exact failure this script
    // exists for: an unknown path being answered with an app shell. That is
    // not a transport error, it is a different build.
    console.log(`MISMATCH  ${ORIGIN} answered /build.json with ${response.status} but did not return JSON.`);
    console.log(`          It served ${text.trim().slice(0, 40).replace(/\s+/g, " ")}…`);
    console.log("          That is a build with no manifest — a different codebase, or one deployed");
    console.log("          before this check existed and still using the SPA catch-all.");
    process.exit(1);
  }
} catch (error) {
  console.log(`ERROR     could not reach ${ORIGIN}: ${error.message}`);
  process.exit(2);
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
