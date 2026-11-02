/**
 * A team's two colours, and the theme the app is drawn in from them.
 *
 * The app is always in the athlete's team colours. The Cubs and Norths have
 * hand-tuned themes in the stylesheet; every other team's theme is worked out
 * here from the two colours the athlete gives at sign-up, so it reads in light
 * and dark mode: the main colour fills buttons and the active day, a lighter
 * shade of it carries text on dark backgrounds, and the second colour is the
 * accent — the progress bar, ticks and stage markers.
 */

export interface TeamColours {
  primary: string;
  secondary: string;
}

/**
 * Every GBL Division 1 and ABL team's colours, read off each club's own logo
 * (or, where the logo is one colour, the colours the club lists). The sign-up
 * question starts from these; the athlete can change them.
 */
export const KNOWN_TEAM_COLOURS: Readonly<Record<string, TeamColours>> = {
  // GBL Division 1
  "Beenleigh Hawks": { primary: "#003c24", secondary: "#f2c500" },
  "Carina Red Sox": { primary: "#e00000", secondary: "#007854" },
  "Coomera Cubs": { primary: "#3a2268", secondary: "#24909f" },
  "Narangba Demons": { primary: "#000054", secondary: "#008448" },
  "Pine Hills Lightning": { primary: "#111111", secondary: "#f5c400" },
  "Redcliffe Padres": { primary: "#f0300c", secondary: "#111111" },
  "Redlands Rays": { primary: "#3c86c6", secondary: "#111111" },
  "Surfers Paradise": { primary: "#1d4f9c", secondary: "#111111" },
  "Wests Bulldogs": { primary: "#182454", secondary: "#cc1830" },
  "Windsor Royals": { primary: "#002490", secondary: "#d0202e" },
  // ABL
  "Adelaide Giants": { primary: "#002454", secondary: "#d81830" },
  "Brisbane Bandits": { primary: "#18489c", secondary: "#ffd400" },
  "Perth Heat": { primary: "#c03c30", secondary: "#111111" },
  "Sydney Blue Sox": { primary: "#54a8e4", secondary: "#1c1414" },
};

const HEX = /^#[0-9a-f]{6}$/i;

export function isHexColour(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

/** The colours stored on the profile, or the team's known ones, or null. */
export function readTeamColours(profile: unknown, team?: string): TeamColours | null {
  const raw = (profile && typeof profile === "object" ? (profile as Record<string, unknown>).teamColours : null) as
    | Record<string, unknown>
    | null
    | undefined;
  if (raw && isHexColour(raw.primary) && isHexColour(raw.secondary)) {
    return { primary: raw.primary.toLowerCase(), secondary: raw.secondary.toLowerCase() };
  }
  return team ? (KNOWN_TEAM_COLOURS[team] ?? null) : null;
}

type Rgb = [number, number, number];

function rgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function hex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((part) => Math.round(Math.min(255, Math.max(0, part))).toString(16).padStart(2, "0")).join("")}`;
}

/** `amount` of the way from `from` to `to`. */
export function mix(from: string, to: string, amount: number): string {
  const a = rgb(from);
  const b = rgb(to);
  return hex([0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * amount) as Rgb);
}

/** WCAG relative luminance. */
export function luminance(colour: string): number {
  const [r, g, b] = rgb(colour).map((part) => {
    const c = part / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/** White or near-black, whichever reads better on `colour`. */
export function inkOn(colour: string): string {
  return contrast(colour, "#ffffff") >= contrast(colour, "#0b0b0c") ? "#ffffff" : "#0b0b0c";
}

/** Lightened until it reads on the dark surface (4.5:1 by default), for text in dark mode. */
function readableOnDark(colour: string, ratio = 4.5): string {
  let shade = colour;
  for (let step = 0; step < 20 && contrast(shade, "#0b0b0c") < ratio; step += 1) shade = mix(shade, "#ffffff", 0.12);
  return shade;
}

/** Darkened until it reads on white (4.5:1 by default), for text in light mode. */
function readableOnLight(colour: string, ratio = 4.5): string {
  let shade = colour;
  for (let step = 0; step < 20 && contrast(shade, "#ffffff") < ratio; step += 1) shade = mix(shade, "#000000", 0.12);
  return shade;
}

/**
 * The custom properties a `theme-team` shell reads. Light and dark values are
 * both given; the stylesheet picks between them, as it does for the Cubs.
 */
export function teamThemeVars({ primary, secondary }: TeamColours): Record<string, string> {
  return {
    "--tc-fill": primary,
    "--tc-on-fill": inkOn(primary),
    "--tc-accent-light": readableOnLight(primary),
    "--tc-accent-dark-light": mix(readableOnLight(primary), "#000000", 0.25),
    "--tc-accent-soft-light": mix(primary, "#ffffff", 0.9),
    "--tc-accent-dark": readableOnDark(primary),
    "--tc-accent-dark-dark": mix(readableOnDark(primary), "#ffffff", 0.2),
    "--tc-accent-soft-dark": mix(primary, "#0b0b0c", 0.8),
    // The second colour also labels things (the date and step headings), so it
    // is darkened or lightened just enough to read — 3:1, the large-text bar.
    "--tc-secondary-light": readableOnLight(secondary, 3),
    "--tc-secondary-dark": readableOnDark(secondary, 3),
    "--tc-on-secondary": inkOn(secondary),
    "--tc-secondary-soft-light": mix(secondary, "#ffffff", 0.88),
    "--tc-secondary-soft-dark": mix(secondary, "#0b0b0c", 0.8),
  };
}
