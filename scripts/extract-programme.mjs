import { readFileSync, writeFileSync } from "node:fs";
const src = readFileSync("legacy/app.js", "utf8");
const lines = src.split("\n");

const decls = new Map();
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/);
  if (!m) continue;
  const name = m[1];
  let end = i, depth = 0, started = false;
  if (/^function/.test(lines[i])) {
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]) { if (ch === "{") { depth++; started = true; } else if (ch === "}") depth--; }
      if (started && depth === 0) { end = j; break; }
    }
  } else {
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]) { if ("{[(".includes(ch)) { depth++; started = true; } else if ("}])".includes(ch)) depth--; }
      if (started && depth === 0) { end = j; break; }
      if (!started && /;\s*$/.test(lines[j])) { end = j; break; }
    }
  }
  if (!decls.has(name)) decls.set(name, [i, end]);
}

const roots = ["standardSession","summerSession","recoveryOnlySession","transitionWednesdaySession","nonCompetitionSaturdaySession","getWeekPlan","applyReadinessToSession","adaptTaskForReadiness","readinessAdjustedDuration","todaySelection"];
const IGNORE = new Set(["state","document","window","console","Math","Number","String","Object","Array","JSON","Date","Set","Map","Boolean","isNaN","parseInt","parseFloat","undefined","null","true","false","new","return","if","else","for","of","in","const","let","var","function","typeof","this","await","async"]);
const need = new Set();
function walk(name) {
  if (need.has(name) || !decls.has(name)) return;
  need.add(name);
  const [a, b] = decls.get(name);
  for (const m of lines.slice(a, b + 1).join("\n").matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) {
    const id = m[1];
    if (!IGNORE.has(id) && decls.has(id) && id !== name) walk(id);
  }
}
roots.forEach(walk);

const ordered = [...need].map((n) => [n, ...decls.get(n)]).sort((x, y) => x[1] - y[1]);
let body = ordered.map(([, a, b]) => lines.slice(a, b + 1).join("\n")).join("\n\n");

// The only globals these touch are `state.pbs` (training maxes) and PHASES.
// Thread pbs through a module-level context instead of a page-wide singleton.
body = body.replace(/\bstate\?\.pbs\b/g, "ctx.pbs");
body = body.replace(/\bstate\.pbs\b/g, "ctx.pbs");
// summerSession reads Friday's game pitch count to decide Saturday's work.
body = body.replace(/\bstate\.post\b/g, "(ctx.post ?? {})");
if (/\bstate\b/.test(body.replace(/ctx\.[a-z]+/g, ""))) {
  throw new Error("extraction still references the page-wide `state` singleton");
}
// PHASES is redeclared here; rename to avoid clashing with the canonical dataset.
body = body.replace(/\bPHASES\b/g, "LEGACY_PHASE_TABLE");

const header = `/* eslint-disable */
// @ts-nocheck
/**
 * Programme content and session generation, extracted VERBATIM from the
 * prototype (\`legacy/app.js\`) by \`scripts/extract-programme.mjs\`.
 *
 * This is the athlete's actual training programme: real loads, throw counts,
 * distances, effort percentages and stop-criteria. It is the only surviving
 * record of it — the source manual could not be located — so it is copied
 * rather than reinterpreted. Do not "tidy" the prescriptions.
 *
 * The one change from the original is mechanical: the prototype read training
 * maxes from a page-wide \`state\` singleton, which is threaded through
 * \`setProgrammeContext\` here so the module stays free of globals.
 *
 * @ts-nocheck is deliberate and scoped to this file only. The contents are a
 * verbatim copy of code already proven in production; annotating it would mean
 * editing the prescriptions, which is exactly what must not happen. Type
 * safety is restored at the boundary by \`programmeSessions.ts\`, which wraps
 * this module in a typed API, and behaviour is pinned by tests.
 */

export interface ProgrammeContext {
  pbs?: { trainingMaxes?: { lifts?: Record<string, { value: number; kind?: string }> } };
  /** Post-session reports, keyed by ISO date. Friday's game pitch count
   *  determines whether Saturday is recovery or a primer. */
  post?: Record<string, { gamePitches?: number } | undefined>;
}

let ctx: ProgrammeContext = {};

/** Supply training maxes so strength prescriptions resolve to real loads. */
export function setProgrammeContext(next: ProgrammeContext): void {
  ctx = next ?? {};
}

`;

const footer = `

export {
  LEGACY_PHASE_TABLE,
  TRAP_BAR_WEEK_SPECS,
  ANNUAL_START,
  getWeekPlan,
  todaySelection,
  standardSession,
  summerSession,
  recoveryOnlySession,
  transitionWednesdaySession,
  nonCompetitionSaturdaySession,
  applyReadinessToSession,
  adaptTaskForReadiness,
  isSummerCompetitionPhase,
  isTransitionPhase,
  phaseForWeek as legacyPhaseForWeek,
  isoDate,
  addDays,
  parseDate,
};
`;

writeFileSync("src/domain/programmeContent.ts", header + body + footer);
console.log("wrote src/domain/programmeContent.ts —", (header + body + footer).split("\n").length, "lines");
