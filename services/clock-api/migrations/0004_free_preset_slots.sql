-- Member-authoritative FIRST THREE free timers live exclusively in Clock D1.
-- Do NOT write Starry ID D1 or re-charge previously local-only presets.
-- Existing clock_presets remain paid extras and retain their request history.
CREATE TABLE IF NOT EXISTS clock_free_presets(
 user_id TEXT NOT NULL,
 slot INTEGER NOT NULL CHECK(slot BETWEEN 0 AND 2),
 preset_id TEXT NOT NULL,
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 24),
 duration_seconds INTEGER NOT NULL CHECK(duration_seconds BETWEEN 1 AND 86399),
 version INTEGER NOT NULL DEFAULT 1,
 updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
 PRIMARY KEY(user_id,slot),
 UNIQUE(user_id,preset_id)
);
