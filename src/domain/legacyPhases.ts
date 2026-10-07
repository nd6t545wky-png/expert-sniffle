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
      "Rounds 1 to 10 of the published GBL Division 1 draw, Friday 2 October to Sunday 6 December: training Tuesday/Thursday, games Friday/Sunday, and Wednesday whole-body strength maintenance.",
  },
  {
    id: "summer_break",
    name: "GBL Christmas Break",
    startWeek: 22,
    endWeek: 25,
    color: "#149ca5",
    summary:
      "The four weeks between Round 10 (4–6 December) and Round 11 (Wednesday 6 January): recover first, then rebuild throwing and strength, and get back on the mound before Term 1 competition.",
  },
  {
    id: "summer_second",
    name: "GBL Summer · Term 1",
    startWeek: 26,
    endWeek: 33,
    color: "#5b2e91",
    summary:
      "Rounds 11 to 18, Wednesday 6 January to Sunday 28 February. Round 11 is Wednesday and Sunday; every round after it is Friday and Sunday. The return week is a taper.",
  },
  {
    id: "transition_summer",
    name: "Post-Summer Transition",
    startWeek: 34,
    endWeek: 36,
    color: "#149ca5",
    summary:
      "Three lower-stress weeks after the last summer round on 28 February, before the next winter build.",
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
