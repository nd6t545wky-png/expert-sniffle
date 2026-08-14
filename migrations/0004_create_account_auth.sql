-- better-auth's own tables, plus the join between a signed-in account and the
-- encrypted workspace it owns.
--
-- account_workspaces stores the sync key *wrapped*, not the key: signing in
-- gets you the wrapped key, and only the passphrase unwraps it.

CREATE TABLE "user" (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL,
  image TEXT,
  createdAt DATE NOT NULL,
  updatedAt DATE NOT NULL
);

CREATE TABLE "session" (
  id TEXT PRIMARY KEY NOT NULL,
  expiresAt DATE NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt DATE NOT NULL,
  updatedAt DATE NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE INDEX session_userId_idx ON "session"(userId);

CREATE TABLE account (
  id TEXT PRIMARY KEY NOT NULL,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt DATE,
  refreshTokenExpiresAt DATE,
  scope TEXT,
  password TEXT,
  createdAt DATE NOT NULL,
  updatedAt DATE NOT NULL
);

CREATE UNIQUE INDEX account_provider_account_idx ON account(providerId, accountId);
CREATE INDEX account_userId_idx ON account(userId);

CREATE TABLE verification (
  id TEXT PRIMARY KEY NOT NULL,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt DATE NOT NULL,
  createdAt DATE,
  updatedAt DATE
);

CREATE INDEX verification_identifier_idx ON verification(identifier);

CREATE TABLE passkey (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT,
  publicKey TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  credentialID TEXT NOT NULL,
  counter INTEGER NOT NULL,
  deviceType TEXT NOT NULL,
  backedUp INTEGER NOT NULL,
  transports TEXT,
  createdAt DATE,
  aaguid TEXT
);

CREATE UNIQUE INDEX passkey_credentialID_idx ON passkey(credentialID);
CREATE INDEX passkey_userId_idx ON passkey(userId);

CREATE TABLE account_workspaces (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  wrapped_sync_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX account_workspaces_key_hash_idx ON account_workspaces(key_hash);
