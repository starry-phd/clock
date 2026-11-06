-- Clock-owned D1; no writes to Starry ID databases.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS clock_pricing(
 feature TEXT PRIMARY KEY,
 label TEXT NOT NULL,
 units INTEGER NOT NULL CHECK(units BETWEEN 0 AND 30),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 version INTEGER NOT NULL DEFAULT 1,
 changed_by TEXT,
 changed_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS clock_pricing_audit(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 feature TEXT NOT NULL,
 old_units INTEGER,
 new_units INTEGER NOT NULL,
 old_enabled INTEGER,
 new_enabled INTEGER NOT NULL,
 actor_user_id TEXT NOT NULL,
 changed_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS clock_presets(
 user_id TEXT NOT NULL,
 preset_id TEXT NOT NULL,
 name TEXT NOT NULL,
 duration_seconds INTEGER NOT NULL CHECK(duration_seconds BETWEEN 1 AND 86399),
 state TEXT NOT NULL CHECK(state IN ('pending','active','deleted')),
 request_id TEXT UNIQUE NOT NULL,
 paid_units INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
 PRIMARY KEY(user_id,preset_id)
);
CREATE INDEX IF NOT EXISTS idx_clock_presets_user_state ON clock_presets(user_id,state);
CREATE TABLE IF NOT EXISTS clock_requests(
 user_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 preset_id TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','committed','failed')),
 reservation_id TEXT,
 charge_units INTEGER NOT NULL,
 error_code TEXT,
 created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
 PRIMARY KEY(user_id,request_id)
);
INSERT OR IGNORE INTO clock_pricing(feature,label,units,enabled) VALUES
 ('clock.preset.create','第 4 組起新增計時器',2,0),
 ('clock.ai.schedule','AI 智慧活動流程編排',5,0),
 ('clock.ai.voice','AI 語音提醒',3,0),
 ('clock.ai.summary','AI 計時分析',4,0),
 ('clock.ai.template','AI 計時範本',3,0),
 ('clock.ai.coach','AI 時間教練',8,0);
