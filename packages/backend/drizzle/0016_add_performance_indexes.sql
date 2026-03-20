-- Safe performance indexes (no schema/data changes).
-- Focus: most frequent filters by shop/date/type and product aggregations.

-- receipts: period analytics, demand forecast, employee checks
CREATE INDEX IF NOT EXISTS idx_receipts_shop_type_date
  ON receipts (shop_id, type, close_date);

CREATE INDEX IF NOT EXISTS idx_receipts_close_date_shop
  ON receipts (close_date, shop_id);

CREATE INDEX IF NOT EXISTS idx_receipts_open_user_date
  ON receipts (open_user_uuid, close_date);

-- receipt_positions: top products and dedup by (receipt_id, commodity_uuid)
CREATE INDEX IF NOT EXISTS idx_receipt_positions_shop_date_receipt_commodity
  ON receipt_positions (shop_id, close_date, receipt_id, commodity_uuid);

CREATE INDEX IF NOT EXISTS idx_receipt_positions_receipt_commodity
  ON receipt_positions (receipt_id, commodity_uuid);

-- daily/top aggregates: faster date slices
CREATE INDEX IF NOT EXISTS idx_daily_sales_date
  ON daily_sales (date);

CREATE INDEX IF NOT EXISTS idx_top_products_date
  ON top_products (date);

-- employee directory lookups
CREATE INDEX IF NOT EXISTS idx_employees_details_id
  ON employees_details (id);
