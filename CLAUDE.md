# Working on this repository

Read `CONTRIBUTING.md` first. Two rules from it that are easy to break:

- **One exercise, one log.** Never write two exercises as a single task
  ("Bench press + chest-supported row"). Write separate tasks and pair them as a
  superset (`superset: "A1"`/`"A2"`, `supersetOf: 2`). A year-wide test enforces
  this for every stage where anything is logged.
- **Before every commit:** `npm run typecheck` and `npm test` must both pass.
