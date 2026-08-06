// Copies public/ into dist/, minifying the hand-written client assets.
// Fixes the audit finding that app.js/styles.css/etc. were served as raw,
// unminified source in production.
import { cp, mkdir, rm } from "node:fs/promises";
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

  if (!existsSync(path.join(distDir, "next", "index.html"))) {
    throw new Error("dist/next/index.html is missing — the Vite build did not produce output.");
  }

  console.log(`Built ${distDir} (minified: ${MINIFY.join(", ")}; React app at /next/)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
