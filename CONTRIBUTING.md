# Development workflow

## Branches

| Branch | Purpose |
|---|---|
| `main` | Stable. Always deployable. Never committed to directly. |
| `claude/*`, `feat/*`, `fix/*` | Working branches. Open a PR into `main`. |

`main` is the production branch: whatever is on it should be safe to deploy to
the live Worker at any moment.

### Suggested protection for `main`

Set these once in GitHub → Settings → Branches → Add rule:

- Require a pull request before merging
- Require status checks to pass (`test`, `typecheck`)
- Do not allow force pushes

## Before every commit

```sh
npm run typecheck   # tsc --noEmit
npm test            # vitest run
```

Both must pass. The test suite is fast (< 1s) — there is no reason to skip it.

## Commands

| Command | What it does |
|---|---|
| `npm run typecheck` | Type-check without emitting |
| `npm test` | Run the suite once |
| `npm run test:watch` | Watch mode |
| `npm run build` | Copy `public/` → `dist/`, minify client assets |
| `npm run dev` | Build, then `wrangler dev` locally |
| `npm run deploy` | Build, then `wrangler deploy` |

## Deployment

Production runs on **Cloudflare Workers**, not Pages.

This is deliberate and should not be "simplified" later: the Worker depends on
bindings that Pages does not support — `env.AI` (Workers AI), `env.IMAGES`
(Images binding), and the rate limiters — as well as D1 and R2. Moving to Pages
would remove working features. Workers already serves static assets, supports
`_headers`, and provides preview URLs.

Secrets are set with `wrangler secret put <NAME>` and are never committed. See
`README.md` for the list.

## Repository layout

```
src/domain/    Pure TypeScript domain logic. No UI, no DOM, no storage globals.
               Fully unit tested. Safe to import from anywhere.
src/index.ts   Cloudflare Worker: API routes, integrations, auth.
src/auth.ts    better-auth configuration.
public/        Static assets served by the Worker (currently the prototype).
legacy/        Frozen pre-rebuild snapshot. Reference only — never edited.
scripts/       Build tooling.
```

### The `src/domain` rule

Domain code must stay free of UI and platform globals — no `window`,
no `localStorage`, no `document`, no `fetch`. Storage is reached through the
`StorageLike` interface so it can be tested in memory and reused unchanged
from React.

This is what makes the rebuild safe: the calculations are verified
independently of whatever renders them.

## Data safety

`src/domain/storage.ts` and `importExport.ts` enforce **no silent data
deletion**, and the rules are covered by tests. Before changing them, read
`src/domain/state.ts` — in particular the note on `SCHEMA_VERSION`, which
must not be bumped while the legacy app is still deployed, because that app
treats an unrecognised version as "start fresh" and would erase saved data.
