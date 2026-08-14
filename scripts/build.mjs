// Copies public/ into dist/, minifying the hand-written client assets.
// Fixes the audit finding that app.js/styles.css/etc. were served as raw,
// unminified source in production.
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import * as esbuild from "esbuild";
import { execFileSync } from "node:child_process";

const root = path.dirname(new URL(import.meta.url).pathname);
const publicDir = path.join(root, "..", "public");
const distDir = path.join(root, "..", "dist");

const MINIFY = [
  "app.js",
  "training-history.js",
  "auth-client.js",
  "sw.js",
  "styles.css",
  "legal.css",
];

/**
 * Write the /next/ asset list and a build id into the service worker.
 *
 * The rebuilt app's bundles carry content hashes, so the service worker cannot
 * name them in advance — which is why /next/ was excluded from the cache
 * entirely and the app did not work offline at all. The filenames are read
 * back out of the index Vite just wrote, rather than guessed from a glob, so
 * anything the page does not actually reference is never precached.
 *
 * The build id is derived from those same filenames. A deploy that changes a
 * bundle therefore changes the cache name, and the old cache is dropped on
 * activate — without it a stale shell could pin an old bundle indefinitely.
 */
async function stampServiceWorker(nextIndexPath) {
  const swPath = path.join(distDir, "sw.js");
  if (!existsSync(swPath)) return;

  const html = await readFile(nextIndexPath, "utf8");
  const assets = [...html.matchAll(/(?:src|href)="(\/next\/[^"]+)"/g)].map((match) => match[1]);
  const precache = ["/next/", ...new Set(assets)];

  // Hash of what is being cached, so the id changes exactly when the contents
  // do. Truncated because it only has to be unique between deploys.
  const build = createHash("sha256").update(precache.join("|")).digest("hex").slice(0, 12);

  const source = await readFile(swPath, "utf8");
  const stamped = source
    .replace('"__BUILD_ID__"', JSON.stringify(build))
    .replace('"__NEXT_PRECACHE__"', precache.map((entry) => JSON.stringify(entry)).join(","));

  if (stamped.includes("__NEXT_PRECACHE__") || stamped.includes("__BUILD_ID__")) {
    throw new Error(
      "sw.js still contains a placeholder after stamping — minification changed the token, and the service worker would cache nothing for /next/."
    );
  }

  await writeFile(swPath, stamped);
}

/**
 * A record of exactly what this build contains, written into the build itself.
 *
 * Production is a single Worker that anyone with the account can deploy to,
 * and the last deploy wins silently. When a different codebase overwrote this
 * one, the only way to establish what was actually running was to read
 * Cloudflare's deployment history and diff files by hand — the deployed app
 * could not say which commit it came from, because nothing in it knew.
 *
 * This makes the question answerable from outside: fetch /build.json and it
 * names the commit, whether that commit's tree was clean, and the SHA-256 of
 * every file shipped. `npm run verify:live` compares it against this build,
 * so an overwrite is one command to detect instead of an afternoon.
 */
async function writeBuildManifest() {
  const files = {};
  async function walk(dir, prefix = "") {
    for (const entry of (await readdir(dir)).sort()) {
      const full = path.join(dir, entry);
      const rel = prefix ? `${prefix}/${entry}` : entry;
      if ((await stat(full)).isDirectory()) await walk(full, rel);
      // The manifest cannot contain its own hash.
      else if (rel !== "build.json") {
        files[rel] = createHash("sha256").update(await readFile(full)).digest("hex").slice(0, 16);
      }
    }
  }
  await walk(distDir);

  let commit = "unknown";
  let clean = false;
  try {
    commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: path.join(root, "..") })
      .toString()
      .trim();
    // A dirty tree means the commit alone does not describe what shipped, so
    // it is recorded rather than implied.
    clean =
      execFileSync("git", ["status", "--porcelain"], { cwd: path.join(root, "..") })
        .toString()
        .trim() === "";
  } catch {
    // Not a git checkout. Say so rather than inventing a commit.
  }

  const manifest = {
    commit,
    cleanTree: clean,
    builtAt: new Date().toISOString(),
    fileCount: Object.keys(files).length,
    files,
  };
  await writeFile(path.join(distDir, "build.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function main() {
  if (existsSync(distDir)) await rm(distDir, { recursive: true });
  await mkdir(distDir, { recursive: true });
  await cp(publicDir, distDir, { recursive: true });

  for (const file of MINIFY) {
    const target = path.join(distDir, file);
    if (!existsSync(target)) continue;
    await esbuild.build({
      entryPoints: [target],
      outfile: target,
      allowOverwrite: true,
      minify: true,
      bundle: false,
      logLevel: "warning",
    });
  }

  // The rebuilt React app is served at /next/, alongside the prototype at /.
  // Vite has to run *after* the copy above, because this script empties
  // dist/ first and would otherwise delete Vite's output. Owning the order
  // here keeps `npm run build` a single command that cannot be run wrong.
  execFileSync("npx", ["vite", "build"], { stdio: "inherit", cwd: path.join(root, "..") });

  const nextIndex = path.join(distDir, "next", "index.html");
  if (!existsSync(nextIndex)) {
    throw new Error("dist/next/index.html is missing — the Vite build did not produce output.");
  }

  await stampServiceWorker(nextIndex);

  // Last, so it hashes the finished build including the stamped service worker.
  const manifest = await writeBuildManifest();

  console.log(
    `Built ${distDir} (minified: ${MINIFY.join(", ")}; React app at /next/; ` +
      `${manifest.fileCount} files from ${manifest.commit.slice(0, 8)}${manifest.cleanTree ? "" : "-dirty"})`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
