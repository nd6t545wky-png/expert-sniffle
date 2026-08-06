import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const here = import.meta.dirname;

/**
 * The rebuilt React app is served alongside the existing prototype at
 * `/next/`, not in place of it. Nothing goes dark while the port is verified;
 * `/` keeps serving the live app until this one reaches parity.
 */
export default defineConfig({
  plugins: [react()],
  root: resolve(here, "ui"),
  base: "/next/",
  build: {
    outDir: resolve(here, "dist/next"),
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
  },
});
