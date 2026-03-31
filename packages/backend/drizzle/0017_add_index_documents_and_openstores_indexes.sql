-- Safe performance indexes for frequently used queries.
-- No schema/data changes, only non-unique IF NOT EXISTS indexes.

-- index_documents: common filters + ordering in documents repository and AI routes
CREATE INDEX IF NOT EXISTS idx_index_documents_shop_close_date_type
  ON index_documents (shop_id, close_date, type);

CREATE INDEX IF NOT EXISTS idx_index_documents_open_user_close_date
  ON index_documents (open_user_uuid, close_date);

-- openStors indexes are created in Drizzle schema, not needed here
