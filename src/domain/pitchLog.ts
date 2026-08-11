/**
 * Pitch-by-pitch ball flight, and the importers that fill it.
 *
 * The one whole category the app had nothing for. A pitcher's most-looked-at
 * numbers — velocity, spin, break, extension — lived nowhere, so pitch design
 * was invisible and "top velocity" was a figure typed in by hand once a day.
 *
 * Two ways in, and they store the same record:
 *
 *   - Typed by hand, which works with a radar gun and a notebook.
 *   - Dropped in as a CSV exported from Rapsodo, TrackMan or Pocket Radar.
 *
 * The importer is deliberately tolerant about *headers* and strict about
 * *values*. Vendors rename columns between firmware versions and localise
 * them, so a header is matched on a normalised form against a list of known
 * aliases. A row whose numbers cannot be read is reported as skipped with a
 * reason — never dropped quietly, because a silently-shortened import is a
 * bullpen that looks lighter than it was.
 */

import { IsoDate } from "./state";

export type PitchSource = "manual" | "rapsodo" | "trackman" | "pocketRadar";

export const SOURCE_LABEL: Record<PitchSource, string> = {
  manual: "Typed in",
  rapsodo: "Rapsodo",
  trackman: "TrackMan",
  pocketRadar: "Pocket Radar",
};

export interface Pitch {
  id: string;
  date: IsoDate;
  /** Normalised name — "Fastball", "Slider". Empty when the file did not say. */
  pitchType: string;
  velocityMph: number | null;
  spinRpm: number | null;
  spinEfficiencyPct: number | null;
  /** Induced vertical break, inches. Positive is "rise" relative to gravity. */
  inducedVertBreakIn: number | null;
  /** Horizontal break, inches. Sign is the vendor's own convention. */
  horzBreakIn: number | null;
  releaseHeightFt: number | null;
  releaseSideFt: number | null;
  extensionFt: number | null;
  source: PitchSource;
}

// --- Pitch type normalisation ------------------------------------------------

/**
 * Vendors and taggers disagree on names for the same pitch: "FF", "4-Seam",
 * "Four-Seam Fastball" and "Fastball" are one pitch, and leaving them apart
 * would split a session's fastballs across four rows of the summary.
 */
const PITCH_TYPE_ALIASES: [RegExp, string][] = [
  [/^(ff|fa|4s|four[\s-]?seam|4[\s-]?seam|fastball|fb)$/i, "Fastball"],
  [/^(si|ft|2s|two[\s-]?seam|2[\s-]?seam|sinker|two seam fastball)$/i, "Sinker"],
  [/^(fc|ct|cut|cutter)$/i, "Cutter"],
  [/^(sl|slider)$/i, "Slider"],
  [/^(st|sw|sweeper)$/i, "Sweeper"],
  [/^(cb|cu|kc|curve|curveball|knuckle curve)$/i, "Curveball"],
  [/^(ch|change|changeup|change[\s-]?up)$/i, "Changeup"],
  [/^(fs|sp|split|splitter|split[\s-]?finger)$/i, "Splitter"],
  [/^(kn|knuckle|knuckleball)$/i, "Knuckleball"],
];

export function normalisePitchType(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  for (const [pattern, name] of PITCH_TYPE_ALIASES) {
    if (pattern.test(raw)) return name;
  }
  // An unrecognised tag is kept as written rather than discarded — a coach's
  // own label is data, not noise.
  return raw.replace(/\s+/g, " ");
}

// --- CSV parsing -------------------------------------------------------------

/** Splits a CSV line, honouring double-quoted fields containing commas. */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else quoted = false;
      } else cell += char;
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells.map((value) => value.trim());
}

/** Header keys compared in a normalised form, so punctuation cannot matter. */
function headerKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Column aliases per field, in priority order.
 *
 * Drawn from the real exports: TrackMan writes `RelSpeed`, `SpinRate`,
 * `InducedVertBreak`, `HorzBreak`, `Extension`; Rapsodo writes `Velocity`,
 * `Total Spin`, `VB (trajectory)`, `HB (trajectory)`, `Release Height`;
 * Pocket Radar writes only a speed.
 */
const FIELD_ALIASES: Record<keyof Omit<Pitch, "id" | "date" | "source">, string[]> = {
  pitchType: ["taggedpitchtype", "autopitchtype", "pitchtype", "pitch", "type"],
  velocityMph: ["relspeed", "velocity", "velo", "speed", "speedmph", "pitchspeed", "maxvelocity"],
  spinRpm: ["spinrate", "totalspin", "rpm", "spin"],
  spinEfficiencyPct: ["spinefficiencyrelease", "spinefficiency", "spineff", "truespinpercent"],
  inducedVertBreakIn: ["inducedvertbreak", "vbtrajectory", "inducedverticalbreak", "vb", "verticalbreak"],
  horzBreakIn: ["horzbreak", "hbtrajectory", "horizontalbreak", "hb"],
  releaseHeightFt: ["relheight", "releaseheight", "rheight"],
  releaseSideFt: ["relside", "releaseside", "rside"],
  extensionFt: ["extension", "releaseextension"],
};

const DATE_ALIASES = ["date", "pitchdate", "sessiondate", "datetime", "timestamp"];

/** A row that could not be read, and why. */
export interface SkippedRow {
  /** 1-based line number in the file, so it can be found again. */
  line: number;
  reason: string;
}

export interface ImportResult {
  source: PitchSource;
  pitches: Pitch[];
  skipped: SkippedRow[];
  /** Fields the file did not carry, so the UI can say what is missing. */
  missingFields: string[];
}

/**
 * Which device wrote this file, from the columns it carries.
 *
 * Detection is by distinctive header, not by filename — a file renamed on the
 * way out of a laptop is still a TrackMan export.
 */
export function detectSource(headers: string[]): PitchSource {
  const keys = new Set(headers.map(headerKey));
  if (keys.has("relspeed") || keys.has("taggedpitchtype") || keys.has("inducedvertbreak")) {
    return "trackman";
  }
  if (keys.has("totalspin") || keys.has("hbtrajectory") || keys.has("vbtrajectory")) {
    return "rapsodo";
  }
  // Pocket Radar measures speed and nothing else, so a file with a speed and
  // no spin or break column is one of its exports.
  if ((keys.has("speed") || keys.has("speedmph")) && !keys.has("spinrate") && !keys.has("totalspin")) {
    return "pocketRadar";
  }
  return "manual";
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || /^(na|n\/a|-|--)$/i.test(text)) return null;
  // Strip units a vendor may have written into the cell ("92.4 mph").
  const parsed = Number(text.replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/** ISO date from the many shapes an export may use. */
export function toIsoDate(value: unknown, fallback: IsoDate): IsoDate {
  const text = String(value ?? "").trim();
  if (!text) return fallback;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // US-style m/d/Y, which is what Rapsodo and Pocket Radar write.
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slash) {
    const year = Number(slash[3]) < 100 ? 2000 + Number(slash[3]) : Number(slash[3]);
    const month = String(Number(slash[1])).padStart(2, "0");
    const day = String(Number(slash[2])).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return fallback;
}

/**
 * Find the header row.
 *
 * Rapsodo writes a title and a player name above the real header, so the
 * first line of the file is frequently not the header. The header is the
 * first line that carries at least two known column names.
 */
function findHeaderRow(lines: string[]): number {
  const known = new Set([...Object.values(FIELD_ALIASES).flat(), ...DATE_ALIASES]);
  for (let index = 0; index < Math.min(lines.length, 25); index += 1) {
    const cells = splitCsvLine(lines[index]).map(headerKey);
    if (cells.filter((cell) => known.has(cell)).length >= 2) return index;
  }
  return -1;
}

let counter = 0;
function pitchId(): string {
  counter += 1;
  return `p${Date.now().toString(36)}${counter.toString(36)}`;
}

/**
 * Read a vendor CSV into pitches.
 *
 * `fallbackDate` is used for rows carrying no date of their own — a Pocket
 * Radar export often has none, and filing those under the session they were
 * imported into is the only honest option available.
 */
export function parsePitchCsv(text: string, fallbackDate: IsoDate): ImportResult {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  const headerIndex = findHeaderRow(lines);
  if (headerIndex === -1) {
    return {
      source: "manual",
      pitches: [],
      skipped: [{ line: 1, reason: "No recognisable column headers — is this a pitch export?" }],
      missingFields: [],
    };
  }

  const headers = splitCsvLine(lines[headerIndex]);
  const keys = headers.map(headerKey);
  const source = detectSource(headers);

  const columnFor = (aliases: string[]): number => {
    for (const alias of aliases) {
      const at = keys.indexOf(alias);
      if (at !== -1) return at;
    }
    return -1;
  };

  const columns = Object.fromEntries(
    Object.entries(FIELD_ALIASES).map(([field, aliases]) => [field, columnFor(aliases)])
  ) as Record<keyof Omit<Pitch, "id" | "date" | "source">, number>;
  const dateColumn = columnFor(DATE_ALIASES);

  const pitches: Pitch[] = [];
  const skipped: SkippedRow[] = [];

  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const cells = splitCsvLine(lines[index]);
    const line = index + 1;

    // A trailing summary row is dropped *before* its numbers are read.
    // Checking only rows that lack a speed let "Average,,,87.4" through as a
    // sixth pitch — inflating the count and, worse, competing for the max.
    const first = (cells[0] ?? "").trim().toLowerCase();
    if (/^(avg|average|mean|max|maximum|min|minimum|total|summary|overall)\b/.test(first)) continue;
    if (cells.every((cell) => !cell)) continue;

    const read = (field: keyof typeof columns) =>
      columns[field] === -1 ? null : toNumber(cells[columns[field]]);

    const velocity = read("velocityMph");
    // A pitch with no speed is the one row that carries nothing usable — every
    // other field is optional, this one is the record.
    if (velocity === null) {
      skipped.push({ line, reason: "No pitch speed in this row" });
      continue;
    }
    if (velocity <= 0 || velocity > 130) {
      skipped.push({ line, reason: `Pitch speed ${velocity} is outside a believable range` });
      continue;
    }

    pitches.push({
      id: pitchId(),
      date: toIsoDate(dateColumn === -1 ? "" : cells[dateColumn], fallbackDate),
      pitchType: normalisePitchType(columns.pitchType === -1 ? "" : cells[columns.pitchType]),
      velocityMph: velocity,
      spinRpm: read("spinRpm"),
      spinEfficiencyPct: read("spinEfficiencyPct"),
      inducedVertBreakIn: read("inducedVertBreakIn"),
      horzBreakIn: read("horzBreakIn"),
      releaseHeightFt: read("releaseHeightFt"),
      releaseSideFt: read("releaseSideFt"),
      extensionFt: read("extensionFt"),
      source,
    });
  }

  const missingFields = Object.entries(columns)
    .filter(([, at]) => at === -1)
    .map(([field]) => field);

  return { source, pitches, skipped, missingFields };
}

// --- Reading the log ---------------------------------------------------------

export interface PitchTypeSummary {
  pitchType: string;
  count: number;
  avgVelocity: number;
  maxVelocity: number;
  avgSpin: number | null;
  avgInducedVertBreak: number | null;
  avgHorzBreak: number | null;
}

function mean(values: (number | null)[]): number | null {
  const real = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!real.length) return null;
  return Math.round((real.reduce((sum, value) => sum + value, 0) / real.length) * 10) / 10;
}

/**
 * One row per pitch type, busiest first.
 *
 * Averages skip pitches that did not carry the field rather than treating a
 * missing break as zero — a Pocket Radar session mixed into a Rapsodo one must
 * not drag the average break toward nothing.
 */
export function pitchTypeSummaries(pitches: Pitch[]): PitchTypeSummary[] {
  const groups = new Map<string, Pitch[]>();
  for (const pitch of pitches) {
    const key = pitch.pitchType || "Untagged";
    groups.set(key, [...(groups.get(key) ?? []), pitch]);
  }

  return [...groups.entries()]
    .map(([pitchType, group]) => {
      const speeds = group.map((pitch) => pitch.velocityMph).filter((v): v is number => v !== null);
      return {
        pitchType,
        count: group.length,
        avgVelocity: mean(speeds) ?? 0,
        maxVelocity: speeds.length ? Math.max(...speeds) : 0,
        avgSpin: mean(group.map((pitch) => pitch.spinRpm)),
        avgInducedVertBreak: mean(group.map((pitch) => pitch.inducedVertBreakIn)),
        avgHorzBreak: mean(group.map((pitch) => pitch.horzBreakIn)),
      };
    })
    .sort((a, b) => b.count - a.count);
}

/** Fastest pitch in a set, with what it was. */
export function topVelocity(pitches: Pitch[]): { mph: number; pitchType: string } | null {
  let best: Pitch | null = null;
  for (const pitch of pitches) {
    if (pitch.velocityMph === null) continue;
    if (!best || pitch.velocityMph > (best.velocityMph ?? 0)) best = pitch;
  }
  return best && best.velocityMph !== null
    ? { mph: best.velocityMph, pitchType: best.pitchType || "Untagged" }
    : null;
}

function isPitch(value: unknown): value is Pitch {
  if (typeof value !== "object" || value === null) return false;
  const speed = (value as Pitch).velocityMph;
  return typeof (value as Pitch).id === "string" && (speed === null || Number.isFinite(Number(speed)));
}

/** Pitches for a date, read defensively out of synced state. */
export function readPitches(map: Record<string, unknown> | undefined, date: string): Pitch[] {
  const day = map?.[date];
  return Array.isArray(day) ? day.filter(isPitch) : [];
}

/** Every pitch on record, newest date first. */
export function allPitches(map: Record<string, unknown> | undefined): Pitch[] {
  return Object.keys(map ?? {})
    .sort()
    .reverse()
    .flatMap((date) => readPitches(map, date));
}
