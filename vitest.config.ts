import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Kept separate from vite.config.ts on purpose: that config sets `root` to
 * `ui/` so the app builds from there, which would otherwise hide every test
 * under src/ from Vitest.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["ui/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "ui/**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", "dist/**", "legacy/**"],
  },
});
