# Pitching OS

A private annual pitching, readiness, biomechanics and nutrition performance
dashboard, deployed as a Cloudflare Worker at
`https://dylan-pitching-os.tourmaline-goldfish.workers.dev/`.

## About this repository

This app was originally built directly against Cloudflare (via Wrangler) with
no version control. This repository was reconstructed on 2026-08-05 from the
deployed Worker bundle (pulled via the Cloudflare API) and the live static
assets, as a first source-controlled snapshot, alongside a website/engineering
audit. `src/index.ts` and `src/auth.ts` are a faithful line-for-line
transcription of the deployed server logic — same validation, same SQL, same
crypto — reorganized into readable TypeScript with the esbuild-generated
`__name()`/`env2`-style artifacts cleaned up. Everything under `public/` is a
byte-exact copy of what the live site currently serves (except the two logo
images, which were recompressed — see below).

Because the original TypeScript source, `wrangler.toml`, and dependency
lockfile were never preserved, some details (the exact `compatibility_date`,
the two rate limiter `namespace_id`/limit values) had to be reconstructed as
reasonable defaults — see the comments in `wrangler.jsonc`. Confirm these
against the live Worker (`Cloudflare dashboard → Workers → dylan-pitching-os
→ Settings`) before relying on this as the source of truth.

## Audit fixes applied in this pass

1. **Minification.** The deployed bundle shipped raw, unminified source —
   `auth-client.js` still had `node_modules/.pnpm/...` path comments in it,
   disclosing exact dependency versions (`better-auth@1.6.23`,
   `@simplewebauthn/server@13.3.2`, etc.) for free. `npm run build` now
   minifies `app.js`, `styles.css`, `training-history.js`, `auth-client.js`,
   `sw.js`, and `legal.css` via esbuild before deploy, and `wrangler.jsonc`
   sets `"minify": true` for the Worker script itself.
2. **Cache headers.** `app.js`/`styles.css`/etc. are requested with a
   `?v=46`-style cache-busting query string from `index.html`, but the old
   Worker code force-set `Cache-Control: no-cache, no-store` on them anyway —
   defeating the versioning and adding a network round trip on every load.
   The Worker now only forces `no-store` on `/`, `/index.html`, and `/sw.js`
   (the files that must always be fresh); `public/_headers` gives the
   versioned assets `public, max-age=31536000, immutable`.
3. **`/api/health` info leak.** It was unauthenticated and returned
   `ouraConfigured`, revealing which third-party integration was wired up to
   any anonymous caller. That detail is already available, authenticated, via
   `/api/integrations/oura/status`; the health check now just returns
   `{ "ok": true }`.
4. **`robots.txt` / `favicon.ico`.** Neither existed as real files, so both
   silently fell through to the SPA's `index.html` (wrong content, wrong
   content-type). Added a real `robots.txt` (`Disallow: /`, since this is a
   private app) and a real `favicon.ico` generated from `mark.svg`.
5. **Image weight.** `assets/coomera-cubs-logo.png` (110 KB) and
   `assets/norths-baseball-logo.jpg` (24 KB) were re-encoded (palette PNG /
   mozjpeg) to 41 KB and 19 KB respectively, same dimensions, no visible
   quality loss for a logo at this size.

## Project layout

```
src/index.ts   Worker entry point: routing, sync, Oura/Apple Health
               integrations, mechanics video + nutrition AI screening,
               account management (all behind D1 + R2 + Workers AI)
src/auth.ts    better-auth config (Google OAuth + passkeys)
src/env.ts     Env bindings interface
public/        Static assets served via the Workers Assets binding
scripts/build.mjs   Copies public/ → dist/, minifies the client bundle
wrangler.jsonc      Worker + bindings config
```

## What updates itself

Three records used to be kept by hand in two places each, and the copy that
drifted was usually the one something else was reading.

**A game you enter changes the plan.** Season fixtures live on the schedule
page. The programme's calendar is fixed at fifty-two weeks and guesses, by
phase, which days hold a game — `nonCompetitionSaturdaySession` says so in its
own words: *"No league game is assumed in this calendar block."* An entered
fixture is not an assumption, so `buildSession` builds a game day where there
is a game, on whatever weekday it falls, re-keying the task ids so a Friday
final does not share its record with the Saturday beside it. Recording
high-intent throwing is unblocked for that day too. It only ever *adds* a game:
a day already planned as one is untouched, and an empty fixture list means
nobody has told the app about that week yet, not that the week is empty.

**The week around it re-phases too.** Weeks 9 and 10 are an unload, and the
block table says what they assume: *"Deliberate unload after the final
published FNCBA round."* A final is a game after that round, so the assumption
is false and the week is a competition week wearing an off-season policy. What
changes is only the intensity suppression — the plyo ceiling and the velocity
day — because a taper cuts volume and holds intensity (Bosquet 2007, largest
effects at a 41–60% volume cut with intensity and frequency maintained; Mujika
& Padilla 2003) while an unload cuts both. It invents no policy to do that: a
week with one game is structurally an in-season week and a week with two is a
two-game week, and the table already holds both. A finals *weekend* therefore
resolves to `two_game`, which assigns no separate velocity day at all — the
hard throwing comes out of the games.

The volume is deliberately left alone. The reduced week is 45–55% down on
throwing, which already sits inside the band the tapering meta-analysis reports
as optimal, so whether to change it for a finals series is a judgement about
this athlete rather than something to derive from a date. The plan says so.

**The trap bar jump's load follows a retest.** It was a flat 30 kg in all
fifty-two weeks while every other loaded lift in the programme is a percentage
of a tested number. It is now written as 20% of the tested squat max — which
resolves to the same 30 kg today, and moves when the max does. It gets
progression advice, and that advice is never "add weight": peak power in a
loaded jump occurs at a light load and falls away either side, so loading past
it makes this the slower, more force-dominant lift the trap bar deadlift beside
it already is. The 20% is back-derived from the programme's own number, not
lifted from a trial — reported optimal loads for the jump squat sit between
bodyweight and roughly 30% of squat 1RM and disagree within that band, which is
why Cormie, McGuigan & Newton (Sports Med 2011) conclude it has to be
individualised. Swinton et al. (J Strength Cond Res 2012;26(4):906–13) is why
the implement is a hex bar.

**Ticking a throwing task counts the throws.** The day's total is on the
session screen, beside the ticking, built from what the completed tasks
prescribe and any game logged for the date. Volume opens at the bottom of a
range and intent at the top: what a set costs an arm is set by its hardest
throws, and a total that reads low is one the athlete corrects in a tap on the
screen they are already looking at. Correct it once and the day is theirs —
nothing overwrites a number a person typed, including entries stored before
this existed.

**A logged game fills in the check-out.** The pitch count is not a display
figure: summer's Saturday reads it to decide whether the day after a start is
recovery or a primer.

## Design system

The interface follows the iOS 26/27 material model. Everything below is
enforced by `ui/components/designSystem.test.ts`, which reads the stylesheets
and fails the suite when one of these erodes.

**Materials — chrome floats, content does not.** The rail, the top bar, the
phone's tab strip, sheets and toasts are translucent, blurred and inset from
the window edges. Content underneath them is opaque: a card is a solid surface
on a three-step elevation scale (`--shadow`, `--shadow-raised`,
`--shadow-overlay`), because text read through a blurred backdrop is the part
of this language that does not survive a data-dense screen.
`prefers-reduced-transparency` turns the chrome opaque and drops the filter.

**Corners — one scale.** `--radius-sm` (8px), `--radius-md` (13px), `--radius`
(20px), `--radius-lg` (26px) and `--radius-pill` for controls. No literal
corner anywhere; circles stay circles.

**Type — the iOS ladder.** `--t-xs` (11px) through `--t-3xl` (34px), with 15px
body and 17px emphasis. Sizes above 17px are display type and come from a
token. Numbers are set in tabular figures wherever a figure is compared against
another figure.

**Colour — three, plus a severity ramp.** Ink, muted slate and paper carry the
whole of the chrome; one accent sits on top, and the club themes re-point *only*
that accent — a theme block that starts setting its own surfaces or lines fails
the test. `--warn` and `--crit` mean "ease off" and "do not throw" and never
appear as decoration; a neutral notice is a grey grouped panel, not a tinted
one, so an information box on the Norths theme does not read as an alarm. There
is no green: a plan that is on track is the accent or plain ink, so colour
always means *pay attention to this*. Every literal colour lives in a
custom-property declaration; a hex at the point of use is a test failure.

**Accessibility.** WCAG AA contrast in both themes, every tab stop carrying a
visible focus indicator, every `<button>` with an explicit `type`, and no target
under 24px. Two audits check this against a real browser:

```sh
npm run e2e:serve &      # build and serve dist/ on :8899
npm run design:audit     # contrast + webfont, every page, light and dark
npm run a11y:audit       # focus rings, button types, names, target sizes
npm run design:shots     # screenshots to captured/<label>/ for eyeballing
```

`public/styles.css` and `ui/styles.css` are the same file — the prototype at
`/` serves the first, the app at `/next/` bundles the second. Edit one and copy
it over the other; a test fails if they drift.

## Setup

```sh
npm install
```

Configure secrets (never commit these):

```sh
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put OURA_CLIENT_ID
npx wrangler secret put OURA_CLIENT_SECRET
npx wrangler secret put HEALTH_TOKEN_KEY
npx wrangler secret put WORKSPACE_MASTER_KEY
```

Verify the two rate limiter blocks in `wrangler.jsonc` (`AI_RATE_LIMITER`,
`INTEGRATION_RATE_LIMITER`) match what's configured on the live Worker —
`namespace_id` and the request limit/period aren't recoverable from the
deployed bundle, so they're currently placeholders.

## Build & deploy

```sh
npm run typecheck   # tsc --noEmit
npm run test        # vitest, including the design-system rules
npm run build       # public/ -> dist/, minified
npm run deploy       # build + wrangler deploy
```

`npm run dev` builds once and runs `wrangler dev` for local iteration.
