-- Append-only training history. Rows are written once and never updated, so
-- what happened on a day cannot be quietly rewritten later.
--
-- The event_type CHECK is the same list the Worker enforces in code; both
-- exist so a bug in one does not let an unknown type through.

CREATE TABLE training_history_events (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 12 AND 80),
  key_hash TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'plan_snapshot',
      'health_check_in',
      'task_completion',
      'session_check_out',
      'performance_result',
      'plan_change'
    )
  ),
  session_day TEXT NOT NULL CHECK (length(session_day) = 10),
  occurred_at TEXT NOT NULL,
  encrypted_payload TEXT NOT NULL CHECK (length(encrypted_payload) BETWEEN 32 AND 250000),
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX training_history_owner_cursor_idx
  ON training_history_events (key_hash, occurred_at, id);

CREATE INDEX training_history_owner_day_idx
  ON training_history_events (key_hash, session_day, occurred_at);

CREATE INDEX training_history_owner_type_idx
  ON training_history_events (key_hash, event_type, occurred_at);
