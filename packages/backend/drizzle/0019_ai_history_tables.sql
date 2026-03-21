CREATE TABLE IF NOT EXISTS ai_shift_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_uuid TEXT NOT NULL,
  date TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  summary_text TEXT NOT NULL,
  revenue_actual REAL,
  revenue_plan REAL,
  top_employee TEXT,
  anomalies TEXT,
  recommendations TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_shift_summaries_shop_date
  ON ai_shift_summaries (shop_uuid, date);

CREATE TABLE IF NOT EXISTS ai_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_uuid TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  triggered_at TEXT NOT NULL DEFAULT (datetime('now')),
  message TEXT NOT NULL,
  acknowledged_at TEXT,
  acknowledged_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_alerts_shop_triggered
  ON ai_alerts (shop_uuid, triggered_at);

