-- Safety migration for environments where normalized-sales tables were missing.
CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  close_date TEXT NOT NULL,
  open_user_uuid TEXT,
  type TEXT,
  total REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_receipts_shop_date ON receipts (shop_id, close_date);

CREATE TABLE IF NOT EXISTS receipt_positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  close_date TEXT NOT NULL,
  commodity_uuid TEXT NOT NULL,
  commodity_name TEXT,
  quantity REAL NOT NULL DEFAULT 0,
  price REAL NOT NULL DEFAULT 0,
  cost_price REAL NOT NULL DEFAULT 0,
  sum REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_receipt_positions_shop_date ON receipt_positions (shop_id, close_date);
CREATE INDEX IF NOT EXISTS idx_receipt_positions_commodity ON receipt_positions (commodity_uuid);

CREATE TABLE IF NOT EXISTS products (
  commodity_uuid TEXT PRIMARY KEY,
  name TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS employees (
  employee_uuid TEXT PRIMARY KEY,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stores (
  store_uuid TEXT PRIMARY KEY,
  name TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS daily_sales (
  shop_id TEXT NOT NULL,
  date TEXT NOT NULL,
  revenue REAL NOT NULL DEFAULT 0,
  checks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (shop_id, date)
);

CREATE TABLE IF NOT EXISTS top_products (
  shop_id TEXT NOT NULL,
  date TEXT NOT NULL,
  commodity_uuid TEXT NOT NULL,
  commodity_name TEXT,
  quantity REAL NOT NULL DEFAULT 0,
  revenue REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (shop_id, date, commodity_uuid)
);

CREATE INDEX IF NOT EXISTS idx_top_products_shop_date ON top_products (shop_id, date);
