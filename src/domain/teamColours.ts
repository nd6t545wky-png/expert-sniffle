/**
 * A team's two colours, and the theme the app is drawn in from them.
 *
 * The app is always in the athlete's team colours. The Cubs and Norths have
 * hand-tuned themes in the stylesheet; every other team's theme is worked out
 * here from the two colours the athlete gives at sign-up, so it reads in light
 * and dark mode: the main colour fills buttons and the active day, a lighter
 * shade of it carries text on dark backgrounds, and the second colour is the
 * accent - the progress bar, ticks and stage markers.
 */

export interface TeamColours {
  primary: string;
  secondary: string;
}

/**
 * Every GBL club and ABL team's colours and badge, from the 2026-27 club
 * logo and colour guides (official club sites; hex values approximate).
 * A listed team is always drawn in these; any other team's come from
 * sign-up or the web lookup.
 */
export const KNOWN_TEAMS: Readonly<Record<string, TeamColours & { logo: string }>> = {
  // Greater Brisbane League
  "All Stars": { primary: "#000000", secondary: "#ffffff", logo: "all-stars" },
  "Beenleigh Hawks": { primary: "#1d5038", secondary: "#aed4b2", logo: "beenleigh-hawks" },
  "Carina Red Sox": { primary: "#f4141b", secondary: "#008c72", logo: "carina-red-sox" },
  "Coomera Cubs": { primary: "#63328a", secondary: "#8ccfd3", logo: "" },
  "Ipswich Musketeers": { primary: "#17469a", secondary: "#ed1c24", logo: "ipswich-musketeers" },
  "Mount Gravatt Eagles": { primary: "#174366", secondary: "#e9c400", logo: "mount-gravatt-eagles" },
  "Mudgeeraba Red Sox": { primary: "#e32723", secondary: "#000000", logo: "mudgeeraba-red-sox" },
  "Narangba Demons": { primary: "#0b0b74", secondary: "#008c4a", logo: "narangba-demons" },
  "Pine Hills Lightning": { primary: "#111111", secondary: "#ffb71b", logo: "pine-hills-lightning" },
  "Pine Rivers Rapids": { primary: "#00843d", secondary: "#fdbb30", logo: "pine-rivers-rapids" },
  "Redcliffe Padres": { primary: "#ef4135", secondary: "#000000", logo: "redcliffe-padres" },
  "Redlands Rays": { primary: "#2a83c6", secondary: "#e61e3b", logo: "redlands-rays" },
  "Runcorn Indians": { primary: "#e13b2b", secondary: "#000000", logo: "runcorn-indians" },
  "Southern Stars": { primary: "#47a8a6", secondary: "#000000", logo: "southern-stars" },
  "Surfers Paradise": { primary: "#005aa9", secondary: "#ffffff", logo: "surfers-paradise" },
  "Toowoomba Rangers": { primary: "#13375b", secondary: "#c92c32", logo: "toowoomba-rangers" },
  "Wests Bulldogs": { primary: "#1f2f68", secondary: "#e31b35", logo: "wests-bulldogs" },
  "Windsor Royals": { primary: "#1a2c6a", secondary: "#e32736", logo: "windsor-royals" },
  // ABL
  "Adelaide Giants": { primary: "#002d5d", secondary: "#e31b3d", logo: "adelaide-giants" },
  "Brisbane Bandits": { primary: "#0b4ccb", secondary: "#ffdd00", logo: "brisbane-bandits" },
  "Perth Heat": { primary: "#d71920", secondary: "#000000", logo: "perth-heat" },
  "Sydney Blue Sox": { primary: "#102644", secondary: "#59acdf", logo: "sydney-blue-sox" },
};

/** Other names the same clubs go by. */
const ALIASES: Record<string, string> = {
  carinaredsox: "Carina Red Sox",
  westerndistrictsbulldogs: "Wests Bulldogs",
  wests: "Wests Bulldogs",
  mtgravatteagles: "Mount Gravatt Eagles",
  surfersparadisebaseballclub: "Surfers Paradise",
};

const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
const BY_KEY = new Map(Object.keys(KNOWN_TEAMS).map((name) => [key(name), name]));

/** A listed club, however its name was typed; null for anyone else. */
export function knownTeam(name: string | undefined): (TeamColours & { name: string; logo: string }) | null {
  if (!name) return null;
  const found = BY_KEY.get(key(name)) ?? ALIASES[key(name)];
  if (!found) return null;
  const team = KNOWN_TEAMS[found];
  return { name: found, primary: team.primary, secondary: team.secondary, logo: team.logo ? `/assets/teams/${team.logo}.png` : "" };
}

/** Colours only, for the sign-up question's starting point. */
export const KNOWN_TEAM_COLOURS: Readonly<Record<string, TeamColours>> = Object.fromEntries(
  Object.entries(KNOWN_TEAMS).map(([name, team]) => [name, { primary: team.primary, secondary: team.secondary }])
);

const HEX = /^#[0-9a-f]{6}$/i;

export function isHexColour(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

/** The colours stored on the profile, or the team's known ones, or null. */
export function readTeamColours(profile: unknown, team?: string): TeamColours | null {
  // A listed club is always drawn in its own colours.
  const known = knownTeam(team);
  if (known) return { primary: known.primary, secondary: known.secondary };
  const raw = (profile && typeof profile === "object" ? (profile as Record<string, unknown>).teamColours : null) as
    | Record<string, unknown>
    | null
    | undefined;
  if (raw && isHexColour(raw.primary) && isHexColour(raw.secondary)) {
    return { primary: raw.primary.toLowerCase(), secondary: raw.secondary.toLowerCase() };
  }
  return null;
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
    // is darkened or lightened just enough to read - 3:1, the large-text bar.
    "--tc-secondary-light": readableOnLight(secondary, 3),
    "--tc-secondary-dark": readableOnDark(secondary, 3),
    "--tc-on-secondary": inkOn(secondary),
    "--tc-secondary-soft-light": mix(secondary, "#ffffff", 0.88),
    "--tc-secondary-soft-dark": mix(secondary, "#0b0b0c", 0.8),
  };
}
