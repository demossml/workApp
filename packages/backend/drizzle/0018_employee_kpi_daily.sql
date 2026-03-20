CREATE TABLE IF NOT EXISTS employee_kpi_daily (
  date TEXT NOT NULL,
  shop_uuid TEXT NOT NULL,
  employee_uuid TEXT NOT NULL,
  revenue REAL NOT NULL DEFAULT 0,
  checks INTEGER NOT NULL DEFAULT 0,
  avg_check REAL NOT NULL DEFAULT 0,
  refunds REAL NOT NULL DEFAULT 0,
  sold_qty REAL NOT NULL DEFAULT 0,
  shift_hours REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (date, shop_uuid, employee_uuid)
);

CREATE INDEX IF NOT EXISTS idx_employee_kpi_daily_employee_date
  ON employee_kpi_daily (employee_uuid, date);

CREATE INDEX IF NOT EXISTS idx_employee_kpi_daily_shop_date
  ON employee_kpi_daily (shop_uuid, date);
