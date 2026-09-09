/**
 * The design system, asserted against the stylesheets themselves.
 *
 * `audit-design.mjs` checks contrast and `audit-a11y.mjs` checks operability;
 * both need a browser and a served build, so neither runs on a unit-test pass.
 * These are the rules that can be read straight off the CSS, and they are the
 * ones that erode first: a hand-tuned shadow here, a hardcoded 18px corner
 * there, a green added "just for this badge", and a year later the sheet is
 * back to nine palette blocks and fifty rgba values nobody dares touch.
 *
 * The system is the iOS 26/27 material model:
 *
 *   - Navigation and transient chrome is translucent, blurred and floating.
 *   - Content is opaque, on a three-step elevation scale.
 *   - Corners come from a five-step scale, never from a literal.
 *   - Colour is three chrome tokens plus one accent the club themes re-point,
 *     plus a severity ramp that means something.
 *
 * Each check states the rule and, where it matters, the exception it allows and
 * why. An exception list is the honest way to write this — the alternative is a
 * rule so loose it never fails.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(join(here, "..", path), "utf8");

const STYLES = read("styles.css");
const APP = read("app.css");
const SHEETS: [string, string][] = [
  ["styles.css", STYLES],
  ["app.css", APP],
];

/** The selectors allowed to be a translucent material. */
/**
 * Where the material is allowed.
 *
 * This started as chrome only, on the argument that text read through a
 * blurred backdrop does not survive a data-dense screen. The athlete looked
 * at the result on a phone and asked for the glass back, which settles it:
 * it is their app, and the call was a judgement rather than a finding.
 *
 * So content surfaces are on the list now -- but only these two, named. The
 * rule still exists, and still fails if blur turns up on a table, a row, a
 * chip or a run of text, which is the part that was never about taste.
 */
const CHROME = /\.(sidebar|topbar|bottom-nav|mobile-sheet|toast|card|hero-session)\b/;

/**
 * Every declaration in the sheet, with the line it starts on, its enclosing
 * selector, and comments stripped — the comments in these files quote plenty of
 * the colours and radii the rules below forbid.
 *
 * Whole declarations rather than lines, because a value spanning four lines
 * (the photo scrim does) is one decision and has to be judged as one.
 */
function declarations(css: string): { line: number; selector: string; text: string }[] {
  // Blank the comments in place so offsets — and so line numbers — still match
  // the original.
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
  const out: { line: number; selector: string; text: string }[] = [];
  const stack: string[] = [];
  let buffer = "";
  let start = 0;

  const selector = () => [...stack].reverse().find((entry) => entry && !entry.startsWith("@")) ?? "";
  const lineOf = (index: number) => bare.slice(0, index).split("\n").length;

  for (let index = 0; index < bare.length; index += 1) {
    const char = bare[index];
    if (char === "{") {
      stack.push(buffer.trim().split("\n").pop()?.trim() ?? "");
      buffer = "";
      start = index + 1;
    } else if (char === "}") {
      stack.pop();
      buffer = "";
      start = index + 1;
    } else if (char === ";") {
      const text = buffer.trim();
      if (text) out.push({ line: lineOf(start), selector: selector(), text });
      buffer = "";
      start = index + 1;
    } else {
      buffer += char;
    }
  }
  return out;
}

/** Every declaration of `property`, across both sheets. */
function valuesOf(property: string): { where: string; selector: string; value: string }[] {
  const found: { where: string; selector: string; value: string }[] = [];
  const pattern = new RegExp(`^(?:${property})\\s*:\\s*([\\s\\S]+)$`);
  for (const [name, css] of SHEETS) {
    for (const { line, selector, text } of declarations(css)) {
      const match = text.match(pattern);
      if (match) found.push({ where: `${name}:${line}`, selector, value: match[1].trim() });
    }
  }
  return found;
}

describe("design system", () => {
  it("ships one stylesheet, not two that have drifted", () => {
    // `public/styles.css` is served to the prototype at `/` and `ui/styles.css`
    // is bundled for the app at `/next/`. They are the same file, copied — and
    // a change made to one and not the other is invisible until someone opens
    // the other route.
    expect(read("styles.css")).toBe(
      readFileSync(join(here, "..", "..", "public", "styles.css"), "utf8")
    );
  });

  it("takes every corner from the radius scale", () => {
    // `calc(var(--radius) / 2)` is still on the scale — it is derived from it,
    // which is what a nested control's corner should be. A bare `14px` is not.
    const offenders = valuesOf("border-radius")
      .filter(({ value }) => value !== "inherit")
      .filter(({ value }) => {
        const parts = value
          .replace(/calc\(|\)|[/*+]|\b\d+(?:\.\d+)?\b(?!px|%)/g, " ")
          .split(/\s+/)
          .filter(Boolean);
        return !parts.every((part) => /^(0|50%|var\(--radius)/.test(part));
      })
      .map(({ where, value }) => `${where} ${value.slice(0, 60)}`);
    expect(offenders).toEqual([]);
  });

  it("defines the radius scale once, with a capsule at one end", () => {
    expect(STYLES).toMatch(/--radius-sm:\s*8px/);
    expect(STYLES).toMatch(/--radius:\s*20px/);
    expect(STYLES).toMatch(/--radius-lg:\s*26px/);
    expect(STYLES).toMatch(/--radius-pill:\s*999px/);
  });

  it("keeps the material on the surfaces that are allowed it", () => {
    // Chrome, cards and the session slab carry the glass. Everything else --
    // tables, rows, chips, runs of text -- does not, because a blurred backdrop
    // under dense text is unreadable rather than merely unfashionable.
    const offenders = SHEETS.flatMap(([name, css]) =>
      declarations(css)
        .filter(({ text }) => /^-?(?:webkit-)?backdrop-filter\s*:/.test(text))
        .filter(({ text }) => !/:\s*none/.test(text))
        .filter(({ selector }) => !CHROME.test(selector))
        .map(({ line, selector }) => `${name}:${line} ${selector.slice(0, 60)}`)
    );
    expect(offenders).toEqual([]);
  });

  it("lets people turn translucency off", () => {
    // Honouring the preference means dropping the filter as well as the alpha:
    // a blurred backdrop behind an opaque panel still moves under the text on
    // scroll, which is the part that makes people turn it off in the first
    // place.
    const block = STYLES.match(/@media \(prefers-reduced-transparency: reduce\)\s*\{[\s\S]*?\n\}/);
    expect(block, "no prefers-reduced-transparency block").toBeTruthy();
    expect(block![0]).toMatch(/backdrop-filter:\s*none/);
    expect(block![0]).toMatch(/background:\s*var\(--surface\)/);
  });

  it("takes every shadow from the elevation scale", () => {
    // What survives: `none`, the three tokens, the focus ring, and a hairline
    // ring drawn with zero blur — `inset 0 0 0 1px` is a border on an element
    // that cannot take one, not a shadow.
    const offenders = valuesOf("box-shadow")
      .filter(({ value }) => {
        const bare = value.replace("!important", "").trim();
        return !(
          bare === "none" ||
          bare.startsWith("var(--shadow") ||
          bare.startsWith("var(--focus-ring") ||
          /^inset\s+\d+px\s+0\s+0\s+/.test(bare) ||
          /^inset\s+0\s+0\s+0\s+\d+px\s+/.test(bare) ||
          // The same ring with `inset` written last, which is how the calendar
          // marks today.
          /^0\s+0\s+0\s+\d+px\s+.*\binset$/.test(bare)
        );
      })
      .map(({ where, value }) => `${where} ${value.slice(0, 70)}`);
    expect(offenders).toEqual([]);
  });

  it("keeps display type on the scale", () => {
    // Small sizes are still written as literals in a few hundred places, and
    // that is fine — they are body and caption text. Anything above 17px is
    // display type, is a design decision, and comes from a token.
    const offenders = valuesOf("font-size|font")
      .filter(({ value }) => !value.includes("cqw"))
      .filter(({ value }) =>
        [...value.matchAll(/(\d+(?:\.\d+)?)px/g)].some((match) => Number(match[1]) > 17)
      )
      .map(({ where, value }) => `${where} ${value.slice(0, 60)}`);
    expect(offenders).toEqual([]);
    // And the ladder itself is the iOS one, topping out at the large title.
    expect(STYLES).toMatch(/--t-base:\s*15px/);
    expect(STYLES).toMatch(/--t-lg:\s*17px/);
    expect(STYLES).toMatch(/--t-3xl:\s*34px/);
  });

  it("uses gradients only where a gradient is the data", () => {
    // Three survive, all load-bearing: the two-stop hard split that draws a
    // range slider's filled track, the hatch that marks a partial bar, and the
    // scrim that keeps a caption legible over an athlete's photograph.
    const offenders = SHEETS.flatMap(([name, css]) =>
      declarations(css)
        .filter(({ text }) => /gradient\(/.test(text))
        .filter(
          ({ text }) =>
            !/var\(--range-progress/.test(text) &&
            !/repeating-linear-gradient/.test(text) &&
            !/rgba\(8, 8, 10/.test(text)
        )
        .map(({ line, text }) => `${name}:${line} ${text.slice(0, 80)}`)
    );
    expect(offenders).toEqual([]);
  });

  it("declares every colour as a token, never at the point of use", () => {
    // A literal is allowed in a custom-property declaration — that is what the
    // palette is — and nowhere else. The exception is a neutral black or white
    // with an alpha: a modal scrim, a material and a caption shadow are dimming
    // or frosting, not hue, and there is no sensible token for "70% of whatever
    // is behind this".
    const literal = /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d/;
    const neutral = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/;
    // The recap card's photo scrim is the one hue-carrying literal left, and it
    // cannot become a token: `recapCard.ts` paints the same four stops onto a
    // canvas to save the image, and the preview has to match the file the
    // athlete shares. Changing one without the other is the actual bug here.
    const recapScrim = /rgba\(8,\s*8,\s*10,/;
    const offenders = SHEETS.flatMap(([name, css]) =>
      declarations(css)
        .filter(({ text }) => literal.test(text))
        .filter(({ text }) => !/^--[a-z0-9-]+\s*:/.test(text))
        .filter(({ text }) => !recapScrim.test(text))
        .filter(({ text }) => {
          const values = [...text.matchAll(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
          return !values.every((value) => {
            const parts = value.match(neutral);
            if (!parts) return false;
            const [red, green, blue] = parts.slice(1).map(Number);
            return red === green && green === blue;
          });
        })
        .map(({ line, text }) => `${name}:${line} ${text.slice(0, 80)}`)
    );
    expect(offenders).toEqual([]);
  });

  it("re-points one accent per club, and nothing else", () => {
    // The whole of theming. A club block that starts setting its own surfaces
    // or lines is how two clubs become two applications.
    for (const club of ["norths", "coomera"]) {
      const block = STYLES.match(new RegExp(`\\.app-shell\\.theme-${club}\\s*\\{([^}]*)\\}`));
      expect(block, `no .app-shell.theme-${club} block`).toBeTruthy();
      const properties = [...block![1].matchAll(/(--[a-z-]+)\s*:/g)].map((match) => match[1]);
      expect(properties).toContain("--team-primary");
      expect(properties).toContain("--team-primary-soft");
      for (const property of properties) {
        expect(property, `theme-${club} sets ${property}`).toMatch(
          /^--(accent|accent-dark|accent-soft|accent-on-ink|on-accent|team-primary|team-secondary|team-primary-soft|team-secondary-soft)$/
        );
      }
    }
  });

  it("re-resolves every accent alias on the shell, not once at :root", () => {
    // The bug this exists for: `--blue: var(--accent)` declared on `:root` is
    // substituted *there*. What inherits down the tree is a finished navy hex,
    // so a club theme re-pointing `--accent` lower down changes nothing, and
    // the alias keeps the default accent on every screen of both clubs.
    //
    // It is invisible to the test above, which only asks what the theme blocks
    // set. It shipped: `--blue` (63 rules -- primary button, active nav item,
    // eyebrow, checked task box, stage numbers), `--focus` (every keyboard
    // focus ring) and `--green`/`--lime`/`--lime-dark` all stayed navy under
    // both club themes. `--team-primary` and `--team-primary-soft` escaped only
    // because each theme block re-declares them by hand.
    //
    // The rule that prevents it: an alias of the accent must be declared on
    // `.app-shell`, where the club theme sets `--accent` on the same element,
    // so substitution happens against the themed value.
    const declaredIn = (selector: string) => {
      const block = STYLES.match(new RegExp(`\\n${selector}\\s*\\{([^}]*)\\}`));
      return new Set([...(block?.[1] ?? "").matchAll(/(--[a-z-]+)\s*:/g)].map((m) => m[1]));
    };
    const onShell = declaredIn("\\.app-shell");

    // Everything on :root that is defined *as* the accent, and so cannot follow it.
    const rootAliases = [...STYLES.matchAll(/^\s*(--[a-z-]+):\s*var\(--accent[a-z-]*\)/gm)].map(
      (match) => match[1]
    );
    expect(rootAliases.length, "no accent aliases found — has the palette moved?").toBeGreaterThan(3);

    for (const alias of new Set(rootAliases)) {
      expect(
        onShell.has(alias),
        `${alias} is an alias of the accent but is only declared at :root, so it freezes to the ` +
          `default accent and never follows a club theme. Declare it on .app-shell too.`
      ).toBe(true);
    }
  });

  it("has no green, because colour here means attention", () => {
    // `--green` is kept as a name so several hundred call sites keep resolving,
    // and it points at the accent. A real green would reappear as a literal,
    // which the token check above catches — this names the intent so the next
    // person reads it as a decision rather than a gap.
    expect(STYLES).toMatch(/--green:\s*var\(--accent\)/);
  });

  it("gives the focus ring the last word", () => {
    // Two rules in the sheet outrank the ring group and set `box-shadow: none`.
    // Without the important flag they win, and the app becomes unusable from a
    // keyboard with nothing visibly wrong.
    expect(APP).toMatch(/box-shadow:\s*var\(--focus-ring\)\s*!important/);
  });
});
