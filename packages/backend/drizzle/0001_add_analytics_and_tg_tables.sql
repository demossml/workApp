CREATE TABLE IF NOT EXISTS app_events (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	ts INTEGER NOT NULL,
	event_name TEXT NOT NULL,
	user_id TEXT,
	shop_uuid TEXT,
	role TEXT,
	screen TEXT,
	trace_id TEXT,
	props_json TEXT,
	app_version TEXT
);

CREATE INDEX IF NOT EXISTS app_events_ts_idx ON app_events(ts);
CREATE INDEX IF NOT EXISTS app_events_event_name_idx ON app_events(event_name);
CREATE INDEX IF NOT EXISTS app_events_user_id_idx ON app_events(user_id);
CREATE INDEX IF NOT EXISTS app_events_shop_uuid_idx ON app_events(shop_uuid);
CREATE INDEX IF NOT EXISTS app_events_trace_id_idx ON app_events(trace_id);

CREATE TABLE IF NOT EXISTS metrics_minute (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	minute_ts INTEGER NOT NULL,
	metric_key TEXT NOT NULL,
	shop_uuid TEXT,
	value REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS metrics_minute_ts_idx ON metrics_minute(minute_ts);
CREATE INDEX IF NOT EXISTS metrics_minute_metric_key_idx ON metrics_minute(metric_key);
CREATE INDEX IF NOT EXISTS metrics_minute_shop_uuid_idx ON metrics_minute(shop_uuid);

CREATE TABLE IF NOT EXISTS tg_subscriptions (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id TEXT NOT NULL,
	chat_id TEXT NOT NULL,
	write_access INTEGER NOT NULL DEFAULT 0,
	subscribed_at INTEGER NOT NULL,
	last_sent_at INTEGER,
	settings_json TEXT
);

CREATE INDEX IF NOT EXISTS tg_subscriptions_user_id_idx ON tg_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS tg_subscriptions_chat_id_idx ON tg_subscriptions(chat_id);
CREATE UNIQUE INDEX IF NOT EXISTS tg_subscriptions_user_chat_uidx
	ON tg_subscriptions(user_id, chat_id);
