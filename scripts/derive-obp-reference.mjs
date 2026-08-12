/**
 * Derive reference percentiles from the OpenBiomechanics Project.
 *
 * OBP is Driveline Baseball's open release of marker-based 3D motion capture:
 * 411 pitches from 100 pitchers, free for individual use. It is the only
 * openly-licensed elite pitching dataset that exists, and it is what makes a
 * comparison population possible here at all.
 *
 *   https://github.com/drivelineresearch/openbiomechanics
 *
 * This script downloads the point-of-interest metrics, computes percentiles,
 * and writes `src/domain/obpReference.ts`. It is committed so the numbers in
 * that file can be re-derived and checked rather than taken on trust — and so
 * that when OBP adds athletes, regenerating is one command.
 *
 * The raw dataset is deliberately NOT vendored into this repository. OBP's
 * terms allow individual use but not redistribution, and a derived percentile
 * table is both smaller and the only part this app needs.
 *
 *   node scripts/derive-obp-reference.mjs
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT =
  "https://raw.githubusercontent.com/drivelineresearch/openbiomechanics/main/baseball_pitching/data";

/**
 * Which OBP column stands behind each of this app's measurements, and how
 * closely the two actually correspond.
 *
 * `match` is the honest part. This app measures a 2D projection from a phone;
 * OBP measures a 3D anatomical angle in a lab. Where the two are the same
 * geometric construction seen through a camera, the comparison is rough but
 * meaningful. Where they are different quantities, no band is published at all
 * — a plausible-looking band over a different measurement is worse than none.
 */
const MAP = [
  {
    id: "elbowFlexion",
    column: "elbow_flexion_fp",
    checkpoint: "footStrike",
    match: "close",
    note: "Same three-point angle — shoulder, elbow, wrist — seen through a camera rather than measured in three dimensions.",
  },
  {
    id: "hipShoulderSeparation",
    column: "rotation_hip_shoulder_separation_fp",
    checkpoint: "footStrike",
    match: "close",
    note: "A front-on camera sees this rotation close to square, which makes the projection a fair stand-in for the lab's axial measurement.",
  },
  {
    id: "shoulderAbduction",
    column: "shoulder_abduction_fp",
    checkpoint: "footStrike",
    match: "partial",
    note: "The lab measures true anatomical abduction; this app measures the upper arm against the trunk in the camera plane. Related, not identical — read it as a rough neighbourhood, not a target.",
  },
  {
    id: "leadLegBlock",
    column: "lead_knee_extension_from_fp_to_br",
    checkpoint: "footStrike",
    match: "close",
    note: "A change between two frames rather than an absolute angle, which cancels much of the camera error that affects a single reading.",
  },
];

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const at = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return Math.round(sorted[at] * 10) / 10;
}

function parseCsv(text) {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const keys = head.split(",");
  return lines.map((line) => {
    // OBP's POI file is plain comma-separated with no quoted fields.
    const cells = line.split(",");
    return Object.fromEntries(keys.map((key, index) => [key, cells[index]]));
  });
}

const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

async function main() {
  const [poiText, metaText] = await Promise.all(
    [`${ROOT}/poi/poi_metrics.csv`, `${ROOT}/metadata.csv`].map(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url} returned ${response.status}`);
      return response.text();
    })
  );

  const poi = parseCsv(poiText);
  const meta = new Map(parseCsv(metaText).map((row) => [row.session_pitch, row]));

  const levels = {};
  for (const row of poi) {
    const level = meta.get(row.session_pitch)?.playing_level ?? "unknown";
    levels[level] = (levels[level] ?? 0) + 1;
  }

  const athletes = new Set(poi.map((row) => row.session_pitch.split("_")[0])).size;

  const bands = MAP.map((entry) => {
    const values = poi
      .map((row) => number(row[entry.column]))
      .filter((value) => value !== null)
      .sort((a, b) => a - b);

    return {
      ...entry,
      n: values.length,
      p10: percentile(values, 0.1),
      p25: percentile(values, 0.25),
      p50: percentile(values, 0.5),
      p75: percentile(values, 0.75),
      p90: percentile(values, 0.9),
    };
  });

  const source = `/**
 * Reference percentiles from the OpenBiomechanics Project.
 *
 * GENERATED FILE — do not edit by hand.
 * Regenerate with: node scripts/derive-obp-reference.mjs
 *
 * OBP is Driveline Baseball's open release of marker-based 3D motion capture
 * on elite pitchers, free for individual use:
 *   https://github.com/drivelineresearch/openbiomechanics
 *
 * This is what lets the app say "here is where ${athletes} measured pitchers sat"
 * instead of quoting a threshold from memory. Two things it is not:
 *
 *   - It is not a target. These are college and professional pitchers; the
 *     middle of their range is a description of them, not a goal for anyone
 *     else, and nothing in the app scores against it.
 *   - It is not a like-for-like comparison. OBP measured 3D anatomical angles
 *     with markers in a lab. This app measures a 2D projection through a phone
 *     camera. Where the two constructions differ, no band is published — that
 *     is why only ${bands.length} of the app's measurements carry one.
 */

export interface ObpBand {
  /** The app's measurement id. */
  id: string;
  /** The OBP column these percentiles come from. */
  column: string;
  /** The delivery checkpoint OBP measured at. */
  checkpoint: string;
  /** How well the app's construction corresponds to OBP's. */
  match: "close" | "partial";
  /** Said out loud beside the band. */
  note: string;
  /** Pitches contributing. */
  n: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

/** Pitches, athletes and the mix of levels behind every band below. */
export const OBP_SOURCE = {
  pitches: ${poi.length},
  athletes: ${athletes},
  levels: ${JSON.stringify(levels)},
  cite: "OpenBiomechanics Project, Driveline Baseball",
  url: "https://github.com/drivelineresearch/openbiomechanics",
} as const;

export const OBP_BANDS: ObpBand[] = ${JSON.stringify(bands, null, 2)};

/** The band for one of the app's measurements, or null where none is honest. */
export function obpBandFor(id: string): ObpBand | null {
  return OBP_BANDS.find((band) => band.id === id) ?? null;
}
`;

  const out = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "src", "domain", "obpReference.ts");
  await writeFile(out, source);

  console.log(`${poi.length} pitches from ${athletes} athletes`);
  console.log(`levels: ${JSON.stringify(levels)}`);
  for (const band of bands) {
    console.log(`  ${band.id.padEnd(24)} n=${band.n}  p25–p75 ${band.p25}–${band.p75}  (${band.match})`);
  }
  console.log(`wrote ${out}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
