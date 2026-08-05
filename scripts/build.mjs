// Copies public/ into dist/, minifying the hand-written client assets.
// Fixes the audit finding that app.js/styles.css/etc. were served as raw,
// unminified source in production.
import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import * as esbuild from "esbuild";

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

  console.log(`Built ${distDir} (minified: ${MINIFY.join(", ")})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
