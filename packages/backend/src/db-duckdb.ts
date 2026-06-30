import { Database } from "duckdb";

/** All app data in one DB — sells, positions, payments, stores, plans, salary, etc. */
const APP_DB_PATH = process.env.DUCKDB_SETTINGS_PATH || "./data/evotor-settings.duckdb";

let _appDb: Database | null = null;

export function getDuckDB(): Database {
  if (_appDb) return _appDb;
  _appDb = new Database(APP_DB_PATH);
  return _appDb;
}

/** @deprecated Use getDuckDB() instead — evotor-settings.duckdb now holds all app data. */
export function getSettingsDB(): Database {
  return getDuckDB();
}

// Promisified DuckDB helpers
function dbAll(db: Database, sql: string, ...params: any[]): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const conn = db.connect();
    conn.all(sql, ...params, (err: any, rows: any[]) => {
      conn.close();
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function dbRun(db: Database, sql: string, ...params: any[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const conn = db.connect();
    conn.run(sql, ...params, (err: any) => {
      conn.close();
      if (err) reject(err);
      else resolve();
    });
  });
}

function dbFirst(db: Database, sql: string, ...params: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const conn = db.connect();
    conn.all(sql, ...params, (err: any, rows: any[]) => {
      conn.close();
      if (err) reject(err);
      else resolve((rows && rows.length > 0) ? rows[0] : null);
    });
  });
}

// D1-compatible prepared statement
export class DuckPreparedStatement {
  readonly sql: string;
  params: any[] = [];

  constructor(sql: string) {
    this.sql = sql;
  }

  bind(...params: any[]): this {
    this.params = params;
    return this;
  }

  async all<T = any>(): Promise<{ success: boolean; results: T[]; meta: any }> {
    try {
      const db = getDuckDB();
      const results = await dbAll(db, this.sql, ...this.params);
      return { success: true, results: results as T[], meta: { changes: results.length } };
    } catch (err: any) {
      console.error("D1Adapter.all error:", err.message);
      return { success: false, results: [], meta: { error: err.message } };
    }
  }

  async first<T = any>(): Promise<T | null> {
    try {
      const db = getDuckDB();
      return await dbFirst(db, this.sql, ...this.params) as T;
    } catch {
      return null;
    }
  }

  async run(): Promise<{ success: boolean; meta: { changes: number } }> {
    try {
      const db = getDuckDB();
      await dbRun(db, this.sql, ...this.params);
      return { success: true, meta: { changes: 1 } };
    } catch (err: any) {
      console.error("D1Adapter.run error:", err.message);
      return { success: false, meta: { changes: 0 } };
    }
  }

  async raw<T = any>(): Promise<T[]> {
    const result = await this.all<T>();
    return result.results;
  }
}

export type AppDB = D1Adapter;

export class D1Adapter {
  prepare(sql: string): DuckPreparedStatement {
    return new DuckPreparedStatement(sql);
  }

  async exec(sql: string): Promise<void> {
    const statements = sql.split(";").filter(s => s.trim());
    for (const stmt of statements) {
      try { await dbRun(getDuckDB(), stmt.trim()); } catch (err) { console.warn("D1Adapter exec error:", String(err)); }
    }
  }

  async batch<T = any>(statements: DuckPreparedStatement[]): Promise<any[]> {
    const results: any[] = [];
    for (const stmt of statements) {
      const result = await stmt.all<T>();
      results.push(result);
    }
    return results;
  }
}

let _adapter: D1Adapter | null = null;

export function createD1Adapter(): D1Adapter {
  if (!_adapter) _adapter = new D1Adapter();
  return _adapter;
}

/** @deprecated Use createD1Adapter() instead — evotor-settings.duckdb now holds all app data. */
export function createSettingsAdapter(): D1Adapter {
  return createD1Adapter();
}

export async function ensureSchema(): Promise<void> {
  const db = getDuckDB();  // single connection for schema setup
  const tables = [
    `CREATE TABLE IF NOT EXISTS app_events (ts BIGINT NOT NULL, event_name TEXT NOT NULL, user_id TEXT, shop_uuid TEXT, role TEXT, screen TEXT, trace_id TEXT, props_json TEXT, app_version TEXT)`,
    `CREATE TABLE IF NOT EXISTS metrics_minute (minute_ts BIGINT NOT NULL, metric_key TEXT NOT NULL, shop_uuid TEXT, value DOUBLE NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS tg_subscriptions (user_id TEXT NOT NULL, chat_id TEXT NOT NULL, write_access INTEGER NOT NULL DEFAULT 0, subscribed_at BIGINT NOT NULL, last_sent_at BIGINT, settings_json TEXT)`,
    `CREATE TABLE IF NOT EXISTS onec_prices (store TEXT NOT NULL, sku TEXT NOT NULL, price_type TEXT NOT NULL DEFAULT 'retail', price DOUBLE NOT NULL, currency TEXT DEFAULT 'RUB', updated_at BIGINT NOT NULL, source TEXT DEFAULT 'onec')`,
    `CREATE TABLE IF NOT EXISTS sales_hourly (id INTEGER PRIMARY KEY, shop_uuid TEXT NOT NULL, hour_ts BIGINT NOT NULL, revenue DOUBLE DEFAULT 0, checks INTEGER DEFAULT 0, avg_check DOUBLE DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS normalized_sales (id INTEGER PRIMARY KEY, shop_uuid TEXT NOT NULL, date TEXT NOT NULL, barcode TEXT, commodity_name TEXT, quantity DOUBLE DEFAULT 0, revenue DOUBLE DEFAULT 0, checks INTEGER DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS employees_details (uuid TEXT PRIMARY KEY, id TEXT, name TEXT, last_name TEXT, patronymic_name TEXT, phone TEXT, role TEXT, role_id TEXT, user_id TEXT, stores TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS products_catalog (id INTEGER PRIMARY KEY, uuid TEXT, parent_uuid TEXT, store TEXT, name TEXT, article TEXT, barcode TEXT, price DOUBLE, updated_at BIGINT)`,
    `CREATE SEQUENCE IF NOT EXISTS seq_index_documents`,
    `CREATE TABLE IF NOT EXISTS index_documents (id INTEGER PRIMARY KEY DEFAULT nextval('seq_index_documents'), document_uuid TEXT NOT NULL UNIQUE, store_uuid TEXT NOT NULL, open_date BIGINT NOT NULL, close_date BIGINT NOT NULL, session_number INTEGER, document_number INTEGER, transactions_json TEXT, total DOUBLE, cash DOUBLE, card DOUBLE, created_at BIGINT)`,
    `CREATE TABLE IF NOT EXISTS open_stores (id INTEGER PRIMARY KEY, shop_uuid TEXT NOT NULL UNIQUE, is_open INTEGER DEFAULT 0, open_date TEXT, close_date TEXT, updated_at BIGINT)`,
    `CREATE TABLE IF NOT EXISTS employee_kpi_daily (id INTEGER PRIMARY KEY, employee_uuid TEXT NOT NULL, shop_uuid TEXT NOT NULL, date TEXT NOT NULL, revenue DOUBLE DEFAULT 0, checks INTEGER DEFAULT 0, avg_check DOUBLE DEFAULT 0, items_sold INTEGER DEFAULT 0, hours_worked DOUBLE DEFAULT 0, revenue_per_hour DOUBLE DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS ai_insights_cache (id INTEGER PRIMARY KEY, cache_key TEXT NOT NULL UNIQUE, data_json TEXT, created_at BIGINT NOT NULL, expires_at BIGINT)`,
    `CREATE TABLE IF NOT EXISTS salary_bonus (id INTEGER PRIMARY KEY, employee_uuid TEXT, shop_uuid TEXT, base_salary DOUBLE DEFAULT 0, bonus_plan DOUBLE DEFAULT 0, accessories_pct DOUBLE DEFAULT 5, plan_target DOUBLE DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS salary_data (id INTEGER PRIMARY KEY, employee_uuid TEXT, shop_uuid TEXT, date TEXT, accessories_sales DOUBLE DEFAULT 0, vape_sales DOUBLE DEFAULT 0, total_bonus DOUBLE DEFAULT 0, plan_met INTEGER DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS dead_stocks (id INTEGER PRIMARY KEY, shop_uuid TEXT NOT NULL, name TEXT NOT NULL, quantity INTEGER DEFAULT 0, sold INTEGER DEFAULT 0, last_sale_date TEXT, mark TEXT, move_count INTEGER DEFAULT 0, move_to_store TEXT, snapshot_date TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS schedule (id INTEGER PRIMARY KEY, employee_uuid TEXT NOT NULL, shop_uuid TEXT NOT NULL, date TEXT NOT NULL, shift_type TEXT DEFAULT 'day')`,
    `CREATE TABLE IF NOT EXISTS plan (id INTEGER PRIMARY KEY, shop_uuid TEXT NOT NULL, month TEXT NOT NULL, target_revenue DOUBLE DEFAULT 0, target_checks INTEGER DEFAULT 0, daily_plan DOUBLE DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS open_shops (id INTEGER PRIMARY KEY, shop_uuid TEXT NOT NULL, user_id TEXT, open_date TEXT NOT NULL, photo_urls_json TEXT, cash_expected DOUBLE DEFAULT 0, cash_actual DOUBLE DEFAULT 0, cash_discrepancy DOUBLE DEFAULT 0, comment TEXT, status TEXT DEFAULT 'completed')`,
    `CREATE TABLE IF NOT EXISTS profitReportSnapshots (createdAt TEXT NOT NULL, createdBy TEXT, since TEXT NOT NULL, until TEXT NOT NULL, payloadJson TEXT NOT NULL)`,
  ];
  for (const sql of tables) {
    try { await dbRun(db, sql); } catch (err) { console.warn("ensureSchema table error:", String(err)); }
  }
  // Create views mapping sells/positions/payments to workApp D1 schema
  const views = [
    `CREATE OR REPLACE VIEW receipts AS SELECT doc_id AS receipt_id, store_uuid AS shop_id, close_date, close_sum AS total, 'SELL' AS type FROM sells`,
    `CREATE OR REPLACE VIEW receipt_positions AS SELECT p.doc_id AS receipt_id, s.store_uuid AS shop_id, s.close_date, p.commodity_uuid, p.product_name AS commodity_name, p.quantity, p.sum, 0.0 AS cost_price FROM positions p JOIN sells s ON p.doc_id = s.doc_id`,
    `CREATE OR REPLACE VIEW receipt_payments AS SELECT doc_id AS receipt_id, payment_type, sum FROM payments`,
    `CREATE OR REPLACE VIEW stores AS SELECT DISTINCT store_uuid, store_uuid AS id, store_name AS name FROM sells`,
  ];
  for (const v of views) {
    try { await dbRun(db, v); } catch (err) { console.warn("ensureSchema view error:", String(err)); }
  }
}

// Pre-connect on module load
getDuckDB();
