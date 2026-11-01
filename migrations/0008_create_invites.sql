-- Invite codes: accounts are invite-only.
--
-- The Worker also creates this table on first use (CREATE TABLE IF NOT EXISTS),
-- because the deploy pipeline deliberately does not apply migrations; this file
-- keeps the schema on record and lets a local D1 match production.
--
-- The owner is the user behind the earliest account_workspaces row. A code is
-- single-use: used_by is set once, in the same statement that checks it is
-- unused, so two people cannot redeem one code.

CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  used_by TEXT,
  used_at TEXT,
  revoked_at TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS invites_created_idx ON invites (created_at DESC);
