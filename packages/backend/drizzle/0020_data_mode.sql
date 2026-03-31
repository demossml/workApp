-- Create data_mode table for storing current data source mode
CREATE TABLE IF NOT EXISTS data_mode (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  mode TEXT NOT NULL CHECK (mode IN ('DB', 'ELVATOR')) DEFAULT 'ELVATOR',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default row if not exists
INSERT OR IGNORE INTO data_mode (id, mode) VALUES (1, 'ELVATOR');
