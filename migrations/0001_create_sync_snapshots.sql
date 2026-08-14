-- The encrypted workspace snapshot, one row per recovery key.
--
-- Reconstructed from the live database. This repository had no migrations
-- directory at all: the schema existed only inside the production D1, which
-- meant it could not be reviewed, recreated, or tested against. The file names
-- here match the names already recorded in d1_migrations, so `wrangler d1
-- migrations apply --remote` treats them as applied and changes nothing.
--
-- The payload is ciphertext. The server holds the key hash, never the key.

CREATE TABLE sync_snapshots (
  key_hash TEXT PRIMARY KEY,
  payload TEXT NOT NULL CHECK (length(payload) BETWEEN 16 AND 750000),
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
