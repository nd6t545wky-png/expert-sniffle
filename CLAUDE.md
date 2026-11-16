# Working on this repository

Read `CONTRIBUTING.md` first. Two rules from it that are easy to break:

- **One exercise, one log.** Never write two exercises as a single task
  ("Bench press + chest-supported row"). Write separate tasks and pair them as a
  superset (`superset: "A1"`/`"A2"`, `supersetOf: 2`). A year-wide test enforces
  this for every stage where anything is logged.
- **Before every commit:** `npm run typecheck` and `npm test` must both pass.

## Skills: use them without being asked

The skills in `.claude/skills/` (and any installed globally, such as graphify)
are meant to be picked up automatically. Before starting any task:

- Read the available-skills list and invoke every skill whose description
  matches the task, even when the request does not name it. Examples: UI or
  design work loads `design-taste-frontend`; a bug with an unclear cause loads
  `investigate-first`; questions about how the codebase fits together use
  `graphify`; reviewing a diff uses `code-review`.
- When two skills conflict (say, two design directions), use the one that
  fits the request best and say which one in a line.
- Skip skills for tools this project does not use (OmniRoute `cli-*` and
  `omni-*`, Google ADK `google-agents-*`) unless the request is about them.
- A skill the user turned off for the session (for example "stop caveman")
  stays off.
