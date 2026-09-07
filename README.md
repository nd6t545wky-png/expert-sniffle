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

## Design system

The interface is deliberately structural. Everything below is enforced by
`ui/components/designSystem.test.ts`, which reads the stylesheets and fails the
suite when one of these erodes.

**Colour — three, plus a severity ramp.** Ink, muted slate and paper carry the
whole of the chrome; one accent sits on top and the club themes re-point that
accent and nothing else. `--warn` and `--crit` exist for one job — "ease off"
and "do not throw" — and never appear as decoration. There is no green: a plan
that is on track is the accent or plain ink, so colour on this dashboard always
means *pay attention to this*. Every literal colour lives in a custom-property
declaration; a hex at the point of use is a test failure.

**Structure — lines, not depth.** No blur, no glass, no gradient, no drop
shadow. Surfaces are opaque and separated by 1px lines. `--radius` is 3px and is
the only radius in the system; the sole exception is a status dot, which is a
circle because it is a dot. The rail, the top bar and the phone's tab strip are
flush against the content rather than floating cards inset from it.

**Type — one scale, capped at 26px.** `--t-xs` (10px) through `--t-3xl` (26px).
Hierarchy comes from weight, case and position; nothing in the product is a
hero. Numbers are set in tabular figures wherever a figure is compared against
another figure.

**Density.** The spacing scale is `--sp-1` (4px) to `--sp-7` (24px), and the
page gutter is 16–20px rather than the 34–58px it was. Today's view is a split
panel: the session beside a dense column of shortcut rows, so the day and every
number qualifying it are read without scrolling.

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
