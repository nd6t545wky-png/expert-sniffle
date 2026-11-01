/**
 * At-bat tracking for hitters and two-way players.
 *
 * Ported from the athlete's own BQ Weekly app so the two read the same: the
 * same result codes, the same quality-at-bat rule, the same hard-hit and spray
 * zones, the same formulas. One game per date, its plate appearances in order.
 */

import { IsoDate } from "./state";

export interface ResultCounts {
  ab?: number;
  h?: number;
  tb?: number;
  bip?: number;
  bunt?: number;
  bb?: number;
  hbp?: number;
  k?: number;
  sf?: number;
  sh?: number;
}

/** Results, grouped as the entry screen shows them. Exactly the BQ app's table. */
export const RESULT_GROUPS: readonly { group: string; results: readonly { code: string; label: string; counts: ResultCounts }[] }[] = [
  {
    group: "Hits",
    results: [
      { code: "1B", label: "Single", counts: { ab: 1, h: 1, tb: 1, bip: 1 } },
      { code: "2B", label: "Double", counts: { ab: 1, h: 1, tb: 2, bip: 1 } },
      { code: "3B", label: "Triple", counts: { ab: 1, h: 1, tb: 3, bip: 1 } },
      { code: "HR", label: "Home run", counts: { ab: 1, h: 1, tb: 4, bip: 1 } },
      { code: "BH", label: "Bunt hit", counts: { ab: 1, h: 1, tb: 1, bip: 1, bunt: 1 } },
    ],
  },
  {
    group: "On base",
    results: [
      { code: "BB", label: "Walk", counts: { bb: 1 } },
      { code: "HBP", label: "Hit by pitch", counts: { hbp: 1 } },
      { code: "ROE", label: "Reached on error", counts: { ab: 1, bip: 1 } },
      { code: "FC", label: "Fielder's choice", counts: { ab: 1, bip: 1 } },
    ],
  },
  {
    group: "Outs",
    results: [
      { code: "KS", label: "K swinging", counts: { ab: 1, k: 1 } },
      { code: "KL", label: "K looking", counts: { ab: 1, k: 1 } },
      { code: "GO", label: "Ground out", counts: { ab: 1, bip: 1 } },
      { code: "FO", label: "Fly out", counts: { ab: 1, bip: 1 } },
      { code: "LO", label: "Line out", counts: { ab: 1, bip: 1 } },
      { code: "PO", label: "Pop out", counts: { ab: 1, bip: 1 } },
      { code: "BO", label: "Bunt out", counts: { ab: 1, bip: 1, bunt: 1 } },
    ],
  },
  {
    group: "Situation",
    results: [
      { code: "SF", label: "Sac fly", counts: { sf: 1, bip: 1 } },
      { code: "SH", label: "Sac bunt", counts: { sh: 1, bip: 1, bunt: 1 } },
    ],
  },
];

const BY_CODE = new Map(RESULT_GROUPS.flatMap((group) => group.results.map((result) => [result.code, result] as const)));

export const resultLabel = (code: string) => BY_CODE.get(code)?.label ?? code;
export const countsOf = (code: string): ResultCounts => BY_CODE.get(code)?.counts ?? {};
export const isBunt = (code: string | null | undefined) => Boolean(code && countsOf(code).bunt);
export const inPlay = (code: string | null | undefined) => Boolean(code && countsOf(code).bip);

/** Taps that go with any result. */
export const SITUATION_TAPS = [
  ["adv", "Moved the runner"],
  ["r3", "Scored runner from 3rd"],
  ["hnr", "Hit and run"],
] as const;
/** Quality-at-bat taps. */
export const QAB_TAPS = [
  ["p7", "7+ pitches"],
  ["two", "Battled with 2 strikes"],
] as const;

export type TapKey = (typeof SITUATION_TAPS)[number][0] | (typeof QAB_TAPS)[number][0];

export interface PlateAppearance {
  res: string;
  rbi: number;
  /** Hard hit: 1 yes, 0 no; absent when not rated (and always on a bunt). */
  hh?: 0 | 1;
  adv?: 1;
  r3?: 1;
  hnr?: 1;
  p7?: 1;
  two?: 1;
  /** Where a ball in play went, on the field drawing, 0–1. */
  x?: number;
  y?: number;
  zone?: string;
}

export interface HittingGame {
  date: IsoDate;
  opp?: string;
  notes?: string;
  pas: PlateAppearance[];
  updatedAt?: string;
}

export const hardOf = (pa: PlateAppearance): 0 | 1 | null => (pa.hh === 0 || pa.hh === 1 ? pa.hh : null);

/** Why an at-bat counts as a quality at-bat; empty when it does not. */
export function qabReasons(pa: PlateAppearance): string[] {
  const counts = countsOf(pa.res);
  const why: string[] = [];
  if (counts.h) why.push("hit");
  if (counts.bb) why.push("walk");
  if (counts.hbp) why.push("HBP");
  if (hardOf(pa) === 1) why.push("hard hit");
  if (pa.rbi) why.push("RBI");
  if (pa.r3) why.push("runner from 3rd");
  if (counts.sh || counts.sf) why.push("sacrifice");
  if (pa.adv) why.push("moved the runner");
  if (pa.hnr) why.push("hit and run");
  for (const [key, label] of QAB_TAPS) if (pa[key]) why.push(label.toLowerCase());
  return why;
}

export interface HitStats {
  pa: number;
  ab: number;
  h: number;
  tb: number;
  bb: number;
  hbp: number;
  k: number;
  sf: number;
  sh: number;
  bip: number;
  bunt: number;
  hard: number;
  rated: number;
  rbi: number;
  xbh: number;
  r3: number;
  qab: number;
  avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
  kp: number | null;
  bbp: number | null;
  hardp: number | null;
  qabp: number | null;
}

export function hitStats(pas: readonly PlateAppearance[]): HitStats {
  const t = { pa: 0, ab: 0, h: 0, tb: 0, bb: 0, hbp: 0, k: 0, sf: 0, sh: 0, bip: 0, bunt: 0, hard: 0, rated: 0, rbi: 0, xbh: 0, r3: 0, qab: 0 };
  for (const pa of pas) {
    t.pa += 1;
    const counts = countsOf(pa.res);
    for (const key of Object.keys(counts) as (keyof ResultCounts)[]) t[key] += counts[key] ?? 0;
    const hard = hardOf(pa);
    if (hard !== null) {
      t.rated += 1;
      t.hard += hard;
    }
    if (pa.r3) t.r3 += 1;
    if (qabReasons(pa).length) t.qab += 1;
    t.rbi += pa.rbi || 0;
    if (pa.res === "2B" || pa.res === "3B" || pa.res === "HR") t.xbh += 1;
  }
  const r = (a: number, b: number) => (b ? a / b : null);
  const avg = r(t.h, t.ab);
  const obp = r(t.h + t.bb + t.hbp, t.ab + t.bb + t.hbp + t.sf);
  const slg = r(t.tb, t.ab);
  return {
    ...t,
    avg,
    obp,
    slg,
    ops: obp !== null && slg !== null ? obp + slg : null,
    kp: r(t.k, t.pa),
    bbp: r(t.bb, t.pa),
    hardp: r(t.hard, t.rated),
    qabp: r(t.qab, t.pa),
  };
}

/** ".333", "1.000", "–". */
export const avgFormat = (value: number | null) =>
  value === null ? "–" : value >= 1 ? value.toFixed(3) : value.toFixed(3).replace(/^0/, "");
export const pctFormat = (value: number | null) => (value === null ? "–" : `${Math.round(value * 100)}%`);

/** "2-for-4, 2B, BB · 1 RBI · QAB 3/5". */
export function gameLine(pas: readonly PlateAppearance[]): string {
  const t = hitStats(pas);
  const extras: string[] = [];
  for (const code of ["2B", "3B", "HR"]) {
    const n = pas.filter((pa) => pa.res === code).length;
    if (n) extras.push(`${n > 1 ? n : ""}${code}`);
  }
  if (t.bb) extras.push(`${t.bb > 1 ? t.bb : ""}BB`);
  if (t.hbp) extras.push(`${t.hbp > 1 ? t.hbp : ""}HBP`);
  if (t.k) extras.push(`${t.k > 1 ? t.k : ""}K`);
  return `${t.h}-for-${t.ab}${extras.length ? `, ${extras.join(", ")}` : ""}${t.rbi ? ` · ${t.rbi} RBI` : ""}${t.pa ? ` · QAB ${t.qab}/${t.pa}` : ""}`;
}

// --- The field ------------------------------------------------------------------

/** Field from the hitter's view: home at the bottom. Fence radius r is 330 ft. */
export const FIELD = { w: 300, h: 262, hx: 150, hy: 248, r: 205 } as const;

export function fieldZone(x: number, y: number): string {
  const dx = x * FIELD.w - FIELD.hx;
  const dy = FIELD.hy - y * FIELD.h;
  const angle = (Math.atan2(dx, dy) * 180) / Math.PI;
  const distance = Math.hypot(dx, dy);
  if (Math.abs(angle) > 45) return "Foul";
  if (distance < (FIELD.r * 155) / 330) {
    return angle < -27 ? "3B" : angle < -6 ? "SS" : angle <= 6 ? "Up the middle" : angle <= 27 ? "2B" : "1B";
  }
  return angle < -27 ? "LF" : angle < -9 ? "LC" : angle <= 9 ? "CF" : angle <= 27 ? "RC" : "RF";
}

/** Degrees from straight away centre; negative is the left side. */
export const sprayAngle = (pa: PlateAppearance) =>
  pa.x === undefined || pa.y === undefined
    ? null
    : (Math.atan2(pa.x * FIELD.w - FIELD.hx, FIELD.hy - pa.y * FIELD.h) * 180) / Math.PI;

/** Where the shortstop and second baseman stand: inside is up the middle. */
export const SS_2B_ANGLE = 15;
export const TENDENCY_GAMES = 5;

/** The read on a hitter once five games are logged — exactly the BQ app's rules. */
export function tendency(games: readonly HittingGame[], bats: string | undefined): string[] | null {
  if (games.length < TENDENCY_GAMES) return null;
  const pas = games.flatMap((game) => game.pas);
  const t = hitStats(pas);
  const n = (code: string) => pas.filter((pa) => pa.res === code).length;
  const pc = (a: number, b: number) => Math.round((100 * a) / b);
  const out: string[] = [];

  const angles = pas
    .filter((pa) => pa.zone && pa.zone !== "Foul")
    .map(sprayAngle)
    .filter((angle): angle is number => angle !== null);
  if (angles.length >= 5) {
    const left = angles.filter((a) => a < -SS_2B_ANGLE).length;
    const right = angles.filter((a) => a > SS_2B_ANGLE).length;
    const middle = angles.length - left - right;
    const side = bats === "Left" ? "L" : bats === "Right" ? "R" : "S";
    const [pull, oppo] = side === "L" ? [right, left] : [left, right];
    const sided = side !== "S";
    if (sided && pc(pull, angles.length) >= 50) out.push(`Pull hitter: ${pc(pull, angles.length)}% of balls in play pulled`);
    else if (sided && pc(oppo, angles.length) >= 45) out.push(`Goes the other way: ${pc(oppo, angles.length)}% to the opposite field`);
    else if (!sided && pc(Math.max(left, right), angles.length) >= 50)
      out.push(`Mostly to the ${left > right ? "left" : "right"} side: ${pc(Math.max(left, right), angles.length)}% of balls in play`);
    else if (pc(middle, angles.length) >= 45) out.push(`Up the middle: ${pc(middle, angles.length)}% of balls in play`);
    else out.push("Uses the whole field");
  }

  const ground = n("GO") + n("FC");
  const air = n("FO") + n("PO") + n("SF");
  const contact = ground + air + n("LO");
  if (contact >= 5) {
    if (pc(ground, contact) >= 50) out.push(`On the ground a lot: ${pc(ground, contact)}% of outs in play are ground balls`);
    else if (pc(air, contact) >= 50) out.push(`In the air a lot: ${pc(air, contact)}% of outs in play are fly or pop outs`);
  }
  if (t.rated >= 5 && t.hardp !== null) {
    if (t.hardp >= 0.45) out.push(`Hits it hard: ${pctFormat(t.hardp)} hard-hit`);
    else if (t.hardp <= 0.2) out.push(`Soft contact: only ${pctFormat(t.hardp)} hard-hit`);
  }
  if (t.pa >= 10 && (t.kp ?? 0) >= 0.25) out.push(`Strikes out ${pctFormat(t.kp)} of the time${n("KL") > n("KS") ? ", more often looking" : ""}`);
  else if (t.k >= 3 && n("KL") > n("KS")) out.push("Strikes out looking more than swinging");
  if (t.pa >= 10 && (t.bbp ?? 0) >= 0.12) out.push(`Patient: walks ${pctFormat(t.bbp)} of the time`);
  if (t.pa >= 10) out.push(`QAB ${pctFormat(t.qabp)}`);
  return out;
}

/** Hitting games read defensively out of synced state, newest first. */
export function readHittingGames(value: unknown): HittingGame[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const games: HittingGame[] = [];
  for (const [date, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !raw || typeof raw !== "object") continue;
    const game = raw as Partial<HittingGame>;
    const pas = Array.isArray(game.pas) ? game.pas.filter((pa) => pa && typeof pa.res === "string" && BY_CODE.has(pa.res)) : [];
    games.push({
      date: date as IsoDate,
      opp: typeof game.opp === "string" ? game.opp : undefined,
      notes: typeof game.notes === "string" ? game.notes : undefined,
      pas: pas as PlateAppearance[],
      updatedAt: typeof game.updatedAt === "string" ? game.updatedAt : undefined,
    });
  }
  return games.sort((a, b) => b.date.localeCompare(a.date));
}
