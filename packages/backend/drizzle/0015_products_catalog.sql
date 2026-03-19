CREATE TABLE IF NOT EXISTS products_catalog (
  commodity_uuid TEXT PRIMARY KEY,
  name TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
