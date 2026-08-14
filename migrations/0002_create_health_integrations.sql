-- Oura OAuth and Apple Health ingest, plus the day-level health summaries.
--
-- Tokens and summaries are stored encrypted; the provider CHECK constraints
-- keep an unknown source from being written at all.

CREATE TABLE oauth_states (
  state_hash TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX oauth_states_expiry_idx ON oauth_states (expires_at);

CREATE TABLE oauth_connections (
  key_hash TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('oura')),
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '',
  provider_user_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (key_hash, provider)
) STRICT;

CREATE TABLE apple_health_connections (
  key_hash TEXT PRIMARY KEY,
  upload_token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_upload_at TEXT
) STRICT;

CREATE TABLE health_daily (
  key_hash TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('oura', 'apple_health')),
  day TEXT NOT NULL CHECK (length(day) = 10),
  summary_encrypted TEXT NOT NULL,
  source_updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (key_hash, provider, day)
) STRICT;

CREATE INDEX health_daily_day_idx ON health_daily (key_hash, day);
