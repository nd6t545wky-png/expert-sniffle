// Copies public/ into dist/, minifying the hand-written client assets.
// Fixes the audit finding that app.js/styles.css/etc. were served as raw,
// unminified source in production.
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

  console.log(`Built ${distDir} (minified: ${MINIFY.join(", ")}; React app at /next/)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
