CREATE TABLE IF NOT EXISTS employees_details (
  uuid TEXT PRIMARY KEY,
  id TEXT,
  name TEXT,
  last_name TEXT,
  patronymic_name TEXT,
  phone TEXT,
  role TEXT,
  role_id TEXT,
  user_id TEXT,
  stores TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_employees_details_user_id ON employees_details (user_id);
