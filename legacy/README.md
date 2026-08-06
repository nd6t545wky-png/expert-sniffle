# Legacy prototype (frozen)

This directory is a **frozen, byte-exact snapshot** of the vanilla-JS prototype
as it was deployed immediately before the Phase 1 React/TypeScript rebuild
began. It is a backup and a reference, not a build input.

Nothing here is compiled, bundled, deployed or imported by the application.
`scripts/build.mjs` only reads `public/`.

## Why it exists

The rebuild has to reproduce behaviour that was never written down anywhere
else. This is the only record of it. When a question comes up about how the
original app calculated readiness, unlocked a session, or gated a task, the
answer is in `app.js` here.

## Contents

| File | Lines | What it holds |
|---|---:|---|
| `app.js` | 6,317 | Entire prototype: state, all views, all domain calculations |
| `styles.css` | 3,561 | Full visual design, theming, responsive layout |
| `auth-client.js` | 2,642 | better-auth client (Google OAuth + passkeys) |
| `training-history.js` | 151 | Training history domain helpers |
| `index.html` | — | SPA shell |
| `sw.js` | — | Service worker / offline app-shell cache |
| `assets/` | — | Club logos |

## Provenance

The prototype was built directly against Cloudflare with no version control.
This snapshot descends from the reconstruction in commit `256189e`, which was
recovered from the deployed Worker bundle and the live static assets.

## Do not edit

If the rebuild is found to have diverged from original behaviour, fix the new
code — do not change these files. Their value is being an unmodified record.
