/**
 * Reference percentiles from the OpenBiomechanics Project.
 *
 * GENERATED FILE — do not edit by hand.
 * Regenerate with: node scripts/derive-obp-reference.mjs
 *
 * OBP is Driveline Baseball's open release of marker-based 3D motion capture
 * on elite pitchers, free for individual use:
 *   https://github.com/drivelineresearch/openbiomechanics
 *
 * This is what lets the app say "here is where 100 measured pitchers sat"
 * instead of quoting a threshold from memory. Two things it is not:
 *
 *   - It is not a target. These are college and professional pitchers; the
 *     middle of their range is a description of them, not a goal for anyone
 *     else, and nothing in the app scores against it.
 *   - It is not a like-for-like comparison. OBP measured 3D anatomical angles
 *     with markers in a lab. This app measures a 2D projection through a phone
 *     camera. Where the two constructions differ, no band is published — that
 *     is why only 4 of the app's measurements carry one.
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
  pitches: 411,
  athletes: 100,
  levels: {"college":314,"independent":42,"milb":23,"high_school":32},
  cite: "OpenBiomechanics Project, Driveline Baseball",
  url: "https://github.com/drivelineresearch/openbiomechanics",
} as const;

export const OBP_BANDS: ObpBand[] = [
  {
    "id": "elbowFlexion",
    "column": "elbow_flexion_fp",
    "checkpoint": "footStrike",
    "match": "close",
    "note": "Same three-point angle — shoulder, elbow, wrist — seen through a camera rather than measured in three dimensions.",
    "n": 411,
    "p10": 82.3,
    "p25": 92,
    "p50": 102.4,
    "p75": 115.8,
    "p90": 125.1
  },
  {
    "id": "hipShoulderSeparation",
    "column": "rotation_hip_shoulder_separation_fp",
    "checkpoint": "footStrike",
    "match": "close",
    "note": "A front-on camera sees this rotation close to square, which makes the projection a fair stand-in for the lab's axial measurement.",
    "n": 411,
    "p10": 20.7,
    "p25": 25.2,
    "p50": 30,
    "p75": 34.7,
    "p90": 38
  },
  {
    "id": "shoulderAbduction",
    "column": "shoulder_abduction_fp",
    "checkpoint": "footStrike",
    "match": "partial",
    "note": "The lab measures true anatomical abduction; this app measures the upper arm against the trunk in the camera plane. Related, not identical — read it as a rough neighbourhood, not a target.",
    "n": 411,
    "p10": 74.6,
    "p25": 80.2,
    "p50": 85.9,
    "p75": 93.3,
    "p90": 98.7
  },
  {
    "id": "leadLegBlock",
    "column": "lead_knee_extension_from_fp_to_br",
    "checkpoint": "footStrike",
    "match": "close",
    "note": "A change between two frames rather than an absolute angle, which cancels much of the camera error that affects a single reading.",
    "n": 411,
    "p10": -2.2,
    "p25": 1.8,
    "p50": 10,
    "p75": 17.5,
    "p90": 25.4
  }
];

/** The band for one of the app's measurements, or null where none is honest. */
export function obpBandFor(id: string): ObpBand | null {
  return OBP_BANDS.find((band) => band.id === id) ?? null;
}
