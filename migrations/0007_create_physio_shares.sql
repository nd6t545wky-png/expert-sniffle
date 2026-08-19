-- Read-only shares, for sending a physio a link.
--
-- The payload here is ciphertext the server cannot read, encrypted under a key
-- that only ever travels in a URL fragment — so this table holds the same kind
-- of opaque blob sync_snapshots does, under a different capability.
--
-- The share id IS the read capability. There is deliberately no endpoint that
-- writes to a workspace through a share, so read-only is a property of the
-- schema and the routes rather than a promise made in a comment.
--
-- key_hash records whose workspace it belongs to, so the athlete can list and
-- revoke their own shares, and so deleting a workspace takes its shares with it.

CREATE TABLE physio_shares (
  share_id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL,
  payload TEXT NOT NULL CHECK (length(payload) BETWEEN 16 AND 400000),
  label TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
) STRICT;

CREATE INDEX physio_shares_owner_idx ON physio_shares (key_hash, created_at DESC);
CREATE INDEX physio_shares_expiry_idx ON physio_shares (expires_at);
