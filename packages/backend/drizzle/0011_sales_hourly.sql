-- Sales hourly heatmap table
CREATE TABLE IF NOT EXISTS sales_hourly (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id TEXT NOT NULL,
  day_of_week INTEGER NOT NULL,
  hour INTEGER NOT NULL,
  revenue REAL NOT NULL DEFAULT 0,
  checks INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_hourly_shop_day_hour
  ON sales_hourly (shop_id, day_of_week, hour);
