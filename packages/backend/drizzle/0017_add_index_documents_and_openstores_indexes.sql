-- Safe performance indexes for frequently used queries.
-- No schema/data changes, only non-unique IF NOT EXISTS indexes.

-- index_documents: common filters + ordering in documents repository and AI routes
CREATE INDEX IF NOT EXISTS idx_index_documents_shop_close_date_type
  ON index_documents (shop_id, close_date, type);

CREATE INDEX IF NOT EXISTS idx_index_documents_open_user_close_date
  ON index_documents (open_user_uuid, close_date);

-- openStors: opening status and latest opening lookups
CREATE INDEX IF NOT EXISTS idx_openStors_shopUuid_date
  ON openStors (shopUuid, date DESC);

CREATE INDEX IF NOT EXISTS idx_openStors_user_shop_date
  ON openStors (userId, shopUuid, date DESC);
