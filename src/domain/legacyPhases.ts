/**
 * The prototype's fixture-based phase layout, preserved verbatim.
 *
 * NOT the canonical structure. `programme.ts` holds that, and the two do not
 * agree — see the note there. This file exists so the prototype's layout is
 * not lost if it turns out to be the correct one for a given season, and so
 * the difference can be inspected rather than argued about from memory.
 *
 * Extracted from `legacy/app.js` (`const PHASES`). Do not edit.
 */

export interface LegacyPhase {
  id: string;
  name: string;
  startWeek: number;
  endWeek: number;
  color: string;
  summary: string;
}

/** Eight fixture-anchored phases spanning weeks 1-52. */
export const LEGACY_PHASES: readonly LegacyPhase[] = Object.freeze([
  {
    id: "winter",
    name: "FNCBA Winter · In Season",
    startWeek: 1,
    endWeek: 8,
    color: "#e52b21",
    summary:
      "Official Division 1 Rounds 12–19: Saturday competition, Wednesday velocity exposure, and no back-to-back high-intent throwing.",
  },
  {
    id: "transition",
    name: "Post-Winter Transition",
    startWeek: 9,
    endWeek: 10,
    color: "#e52b21",
    summary:
      "Unload after the final published FNCBA regular-season round, restore range of motion, and retain basic strength.",
  },
  {
    id: "preseason",
    name: "GBL Preseason",
    startWeek: 11,
    endWeek: 11,
    color: "#5b2e91",
    summary:
      "Rebuild the Tuesday/Thursday team rhythm and prepare for Coomera Cubs' athlete-provided Friday 2 October opener.",
  },
  {
    id: "summer_first",
    name: "GBL Summer · Term 4",
    startWeek: 12,
    endWeek: 21,
    color: "#5b2e91",
    summary:
      "Rounds 1 to 10 of the Cubs' 26/27 draw, beginning Friday 2 October: training Tuesday/Thursday, games Friday/Sunday, and Wednesday whole-body strength maintenance.",
  },
  {
    id: "summer_break",
    name: "GBL Christmas Break",
    startWeek: 22,
    endWeek: 26,
    color: "#149ca5",
    summary:
      "The six weeks the draw leaves between Round 10 and Round 11: recover first, then rebuild throwing and strength before Term 1 competition.",
  },
  {
    id: "summer_second",
    name: "GBL Summer · Term 1",
    startWeek: 27,
    endWeek: 34,
    color: "#5b2e91",
    summary:
      "Rounds 11 to 18: back to the Friday/Sunday rhythm, opening with a taper week into the return round.",
  },
  {
    id: "transition_summer",
    name: "Post-Summer Transition",
    startWeek: 35,
    endWeek: 36,
    color: "#149ca5",
    summary:
      "Two lower-stress weeks after the last summer round, before the next winter build.",
  },
  {
    id: "winter_next",
    name: "FNCBA Winter 2027 · Planning",
    startWeek: 37,
    endWeek: 52,
    color: "#e52b21",
    summary:
      "Provisional Saturday competition rhythm based on the 2026 draw; replace with the official 2027 fixture when published.",
  },
]);
