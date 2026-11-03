-- Coach access: the owner coaching another player's workspace.
--
-- The Worker also creates this table on first use (CREATE TABLE IF NOT EXISTS),
-- because the deploy pipeline deliberately does not apply migrations; this file
-- keeps the schema on record and lets a local D1 match production.
--
-- One row per athlete. The coach asks ('pending'); only the athlete can make it
-- 'active', and only an active row lets the coach fetch the athlete's sync key.
-- Either side deleting the row ends access.

CREATE TABLE IF NOT EXISTS coach_access (
  athlete_user_id TEXT PRIMARY KEY NOT NULL,
  coach_user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'active')),
  requested_at TEXT NOT NULL,
  granted_at TEXT
) STRICT;
