/**
 * The design system, asserted against the stylesheets themselves.
 *
 * `audit-design.mjs` checks contrast and `audit-a11y.mjs` checks operability;
 * both need a browser and a served build, so neither runs in CI on a unit-test
 * pass. These are the rules that can be read straight off the CSS, and they are
 * the ones that erode first: a blur here, a 16px radius there, a green added
 * "just for this badge", and six months later the app looks like every other
 * dashboard again.
 *
 * Each check below states the rule and, where it matters, the exception it
 * allows and why. An exception list is the honest way to write this — the
 * alternative is a rule so loose it never fails.
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

/**
 * Every declaration in the sheet, with the line it starts on and comments
 * stripped — the comments in these files quote plenty of the colours and radii
 * the rules below forbid.
 *
 * Whole declarations rather than lines, because a value that spans four lines
 * (the photo scrim does) is one decision and has to be judged as one.
 */
function declarations(css: string): { line: number; text: string }[] {
  // Blank the comments in place so byte offsets — and therefore line numbers —
  // still line up with the original.
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
  const out: { line: number; text: string }[] = [];
  for (const match of bare.matchAll(/(--)?[-a-zA-Z]+\s*:\s*[^;{}]+/g)) {
    const text = match[0].trim();
    if (!text) continue;
    out.push({ line: bare.slice(0, match.index).split("\n").length, text });
  }
  return out;
}

function findAll(pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const [name, css] of SHEETS) {
    for (const { line, text } of declarations(css)) {
      const match = text.match(pattern);
      if (match) hits.push(`${name}:${line} ${match[0].trim().slice(0, 90)}`);
    }
  }
  return hits;
}

describe("design system", () => {
  it("ships one stylesheet, not two that have drifted", () => {
    // `public/styles.css` is served to the prototype at `/` and `ui/styles.css`
    // is bundled for the app at `/next/`. They are the same file, copied — and
    // a change made to one and not the other is invisible until someone opens
    // the other route.
    expect(read("styles.css")).toBe(readFileSync(join(here, "..", "..", "public", "styles.css"), "utf8"));
  });

  it("has no glass: no backdrop blur anywhere", () => {
    expect(findAll(/-?(?:webkit-)?backdrop-filter\s*:[^;]*/)).toEqual([]);
    expect(findAll(/filter\s*:\s*blur\([^)]*\)/)).toEqual([]);
  });

  it("separates surfaces with lines, not drop shadows", () => {
    // What survives: `none`, the tokens (all of which resolve to `none` bar the
    // focus ring), and a hairline ring drawn with zero blur — `inset 0 0 0 1px`
    // is a border on an element that cannot take one, not a shadow.
    const offenders: string[] = [];
    for (const [name, css] of SHEETS) {
      for (const { line, text } of declarations(css)) {
        for (const match of text.matchAll(/box-shadow\s*:\s*([^;}]+)/g)) {
          const value = match[1].replace("!important", "").trim();
          const allowed =
            value === "none" ||
            value.startsWith("var(--shadow") ||
            value.startsWith("var(--focus-ring") ||
            /^inset\s+\d+px\s+0\s+0\s+/.test(value) ||
            /^inset\s+0\s+0\s+0\s+\d+px\s+/.test(value) ||
            // The same ring with `inset` written last, which is how the
            // calendar marks today.
            /^0\s+0\s+0\s+\d+px\s+.*\binset$/.test(value);
          if (!allowed) offenders.push(`${name}:${line} ${value.slice(0, 70)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps every corner at 3px or sharper", () => {
    const offenders: string[] = [];
    for (const [name, css] of SHEETS) {
      for (const { line, text } of declarations(css)) {
        for (const match of text.matchAll(/border-radius\s*:\s*([^;}]+)/g)) {
          const value = match[1].trim();
          // A status dot is a circle because it is a dot; `50%` is allowed and
          // the browser audits confirm the only elements carrying it are 10px
          // or smaller.
          if (value === "50%" || value === "inherit" || value.includes("var(--radius)")) continue;
          const sizes = [...value.matchAll(/(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
          if (sizes.some((size) => size > 3)) offenders.push(`${name}:${line} ${value.slice(0, 60)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("caps the type scale at 26px — nothing is a hero", () => {
    const offenders: string[] = [];
    for (const [name, css] of SHEETS) {
      for (const { line, text } of declarations(css)) {
        for (const match of text.matchAll(/font-size\s*:\s*([^;}]+)/g)) {
          const value = match[1].trim();
          // Container-query sizes belong to the shareable recap card, which is
          // rendered to an image at a fixed 1080px width rather than laid out
          // in the app.
          if (value.includes("cqw")) continue;
          const sizes = [...value.matchAll(/(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
          if (sizes.some((size) => size > 26)) offenders.push(`${name}:${line} ${value.slice(0, 60)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("uses gradients only where a gradient is the data", () => {
    // Three survive, all of them load-bearing: the two-stop hard split that
    // draws a range slider's filled track, the hatch that marks a partial bar,
    // and the scrim that keeps a caption legible over an athlete's photograph.
    const offenders: string[] = [];
    for (const [name, css] of SHEETS) {
      for (const { line, text } of declarations(css)) {
        if (!/gradient\(/.test(text)) continue;
        const functional =
          /var\(--range-progress/.test(text) ||
          /repeating-linear-gradient/.test(text) ||
          /rgba\(8, 8, 10/.test(text);
        if (!functional) offenders.push(`${name}:${line} ${text.trim().slice(0, 80)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("declares every colour as a token, never at the point of use", () => {
    // A literal is allowed in a custom-property declaration — that is what the
    // palette is — and nowhere else. The exception is a neutral black or white
    // with an alpha: a modal scrim and a caption shadow are dimming, not hue,
    // and there is no sensible token for "38% of whatever is behind this".
    const literal = /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d/;
    const neutral = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/;
    // The recap card's photo scrim is the one hue-carrying literal left, and it
    // cannot become a token: `recapCard.ts` paints the same four stops onto a
    // canvas to save the image, and the preview has to match the file the
    // athlete shares. Changing one without the other is the actual bug here.
    const recapScrim = /rgba\(8,\s*8,\s*10,/;
    const offenders: string[] = [];
    for (const [name, css] of SHEETS) {
      for (const { line, text } of declarations(css)) {
        if (!literal.test(text)) continue;
        if (/^\s*--[a-z0-9-]+\s*:/.test(text)) continue;
        if (recapScrim.test(text)) continue;
        const values = [...text.matchAll(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
        const allNeutral = values.every((value) => {
          const parts = value.match(neutral);
          if (!parts) return false;
          const [red, green, blue] = parts.slice(1).map(Number);
          return red === green && green === blue;
        });
        if (!allNeutral) offenders.push(`${name}:${line} ${text.trim().slice(0, 80)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("has no green, because colour here means attention", () => {
    // `--green` is kept as a name so several hundred call sites keep resolving,
    // and it points at the accent. If a real green ever reappears it will come
    // back as a literal, which the token check above catches — this one names
    // the intent so the next person reads it as a decision rather than a gap.
    expect(STYLES).toMatch(/--green:\s*var\(--accent\)/);
  });

  it("gives the focus ring the last word", () => {
    // Two rules in the sheet outrank the ring group and set `box-shadow: none`.
    // Without the important flag they win, and the app becomes unusable from a
    // keyboard with nothing visibly wrong.
    expect(APP).toMatch(/box-shadow:\s*var\(--focus-ring\)\s*!important/);
  });
});
