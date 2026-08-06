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
    endWeek: 22,
    color: "#5b2e91",
    summary:
      "Coomera Cubs competition begins Friday 2 October: training Tuesday/Thursday, games Friday/Sunday, and Wednesday whole-body strength maintenance.",
  },
  {
    id: "summer_break",
    name: "GBL Christmas Break",
    startWeek: 23,
    endWeek: 28,
    color: "#149ca5",
    summary:
      "No assumed league games: recover first, then rebuild throwing and strength before Term 1 competition.",
  },
  {
    id: "summer_second",
    name: "GBL Summer · Term 1",
    startWeek: 29,
    endWeek: 36,
    color: "#5b2e91",
    summary:
      "Return to the Friday/Sunday competition rhythm and taper into the last pre-Easter weekend.",
  },
  {
    id: "transition_summer",
    name: "Post-Summer Transition",
    startWeek: 37,
    endWeek: 38,
    color: "#149ca5",
    summary:
      "Two lower-stress weeks after the GBL planning window before the next winter build.",
  },
  {
    id: "winter_next",
    name: "FNCBA Winter 2027 · Planning",
    startWeek: 39,
    endWeek: 52,
    color: "#e52b21",
    summary:
      "Provisional Saturday competition rhythm based on the 2026 draw; replace with the official 2027 fixture when published.",
  },
]);
