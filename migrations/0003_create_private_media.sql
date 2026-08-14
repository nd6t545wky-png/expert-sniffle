-- Pointers to private R2 objects. The bytes live in the bucket; these rows
-- are the index, and the object_key UNIQUE constraint is what stops two rows
-- ever claiming the same object.

CREATE TABLE mechanics_videos (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  angle TEXT NOT NULL DEFAULT '',
  captured_on TEXT NOT NULL DEFAULT '',
  pitch_context TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX mechanics_videos_owner_created
  ON mechanics_videos (key_hash, created_at DESC);

CREATE TABLE meal_photos (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  meal_day TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX meal_photos_owner_day
  ON meal_photos (key_hash, meal_day, created_at DESC);
