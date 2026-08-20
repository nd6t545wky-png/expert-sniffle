/**
 * Every theme class the app writes must exist in the stylesheet.
 *
 * The rewrite renamed the summer theme from `theme-coomera` to `theme-cubs`
 * in `App.tsx` and nowhere else, so for every summer week — more than half the
 * year — the shell carried a class the stylesheet had never heard of. Nothing
 * failed: the class applied cleanly, the custom properties under it simply did
 * not exist, and `var(--team-primary)` resolved to nothing everywhere it was
 * used. That is the kind of break no unit test catches and no screenshot of
 * the *current* week catches either, because the current week was winter.
 *
 * `styles.css` is frozen, so this reads it rather than asserting against a
 * hardcoded list: whatever themes the stylesheet defines are the themes the
 * app is allowed to name.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(join(here, "..", path), "utf8");

/** Every `theme-…` class the stylesheet actually defines a rule for. */
function definedThemes(): Set<string> {
  const css = `${read("styles.css")}\n${read("app.css")}`;
  return new Set([...css.matchAll(/\.(theme-[a-z0-9-]+)/g)].map((match) => match[1]));
}

/** Every `theme-…` class the app can put on the shell. */
function usedThemes(): string[] {
  const source = read("App.tsx");
  return [...source.matchAll(/theme:\s*"(theme-[a-z0-9-]+)"/g)].map((match) => match[1]);
}

describe("shell themes", () => {
  it("names at least the two clubs", () => {
    expect(usedThemes().length).toBeGreaterThanOrEqual(2);
  });

  it("only names themes the stylesheet defines", () => {
    const defined = definedThemes();
    for (const theme of usedThemes()) {
      expect([...defined], `App.tsx sets "${theme}", which no rule matches`).toContain(theme);
    }
  });

  it("gives every named theme the team custom properties the app reads", () => {
    // A class that exists but sets no `--team-primary` is the same failure
    // with a different cause, so check the block itself, not just the name.
    const css = read("styles.css");
    for (const theme of usedThemes()) {
      const block = css.match(new RegExp(`\\.app-shell\\.${theme}\\s*\\{([^}]*)\\}`));
      expect(block, `no .app-shell.${theme} block`).toBeTruthy();
      expect(block![1]).toMatch(/--team-primary\s*:/);
      expect(block![1]).toMatch(/--team-primary-soft\s*:/);
    }
  });
});
