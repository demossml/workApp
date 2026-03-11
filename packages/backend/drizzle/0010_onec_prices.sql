-- Migration: add 1C prices integration tables
-- Run: wrangler d1 execute <DB_NAME> --file=migrations/0010_onec_prices.sql

-- Актуальные цены из 1С
CREATE TABLE IF NOT EXISTS onec_prices (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sku         TEXT    NOT NULL,
    barcode     TEXT,
    name        TEXT,
    price       REAL    NOT NULL,
    price_type  TEXT    NOT NULL,  -- purchase | retail | wholesale
    store       TEXT    NOT NULL,  -- код магазина / склада
    changed_at  TEXT,              -- дата изменения цены в 1С (YYYY-MM-DD)
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (sku, store, price_type)
);

CREATE INDEX IF NOT EXISTS idx_onec_prices_sku_store_type ON onec_prices (sku, store, price_type);
CREATE INDEX IF NOT EXISTS idx_onec_prices_store          ON onec_prices (store);
CREATE INDEX IF NOT EXISTS idx_onec_prices_price_type     ON onec_prices (price_type);
CREATE INDEX IF NOT EXISTS idx_onec_prices_sku            ON onec_prices (sku);

-- История изменений цен
CREATE TABLE IF NOT EXISTS onec_price_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sku         TEXT    NOT NULL,
    store       TEXT    NOT NULL,
    price_type  TEXT    NOT NULL,
    old_price   REAL,
    new_price   REAL    NOT NULL,
    changed_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_onec_price_history_sku_store ON onec_price_history (sku, store);

-- Лог входящих запросов из 1С
CREATE TABLE IF NOT EXISTS onec_import_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    store           TEXT,
    price_type      TEXT,
    items_received  INTEGER,
    items_inserted  INTEGER,
    items_updated   INTEGER,
    items_skipped   INTEGER,
    status          TEXT    NOT NULL,  -- success | error
    error_message   TEXT,
    received_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_onec_import_log_store       ON onec_import_log (store);
CREATE INDEX IF NOT EXISTS idx_onec_import_log_received_at ON onec_import_log (received_at);
