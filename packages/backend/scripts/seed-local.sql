-- Минимальный seed для локальной разработки и smoke API.
-- Подготавливает таблицы, которые ожидают маршруты:
-- - /api/evotor/plan-for-today: products + shopProduct
-- - /api/schedules/schedule: openShops

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT,
  group_x INTEGER NOT NULL DEFAULT 0,
  parentUuid TEXT
);

CREATE INDEX IF NOT EXISTS idx_products_parent_uuid
ON products(parentUuid);

-- Справочные UUID групп из plan-for-today (evotor routes)
DELETE FROM products
WHERE uuid IN (
  'seed-product-1',
  'seed-product-2',
  'seed-product-3',
  'seed-product-4',
  'seed-product-5',
  'seed-product-6',
  'seed-product-7',
  'seed-product-8',
  'seed-product-9'
);

INSERT INTO products (uuid, group_x, parentUuid) VALUES
  ('seed-product-1', 0, '78ddfd78-dc52-11e8-b970-ccb0da458b5a'),
  ('seed-product-2', 0, 'bc9e7e4c-fdac-11ea-aaf2-2cf05d04be1d'),
  ('seed-product-3', 0, '0627db0b-4e39-11ec-ab27-2cf05d04be1d'),
  ('seed-product-4', 0, '2b8eb6b4-92ea-11ee-ab93-2cf05d04be1d'),
  ('seed-product-5', 0, '8a8fcb5f-9582-11ee-ab93-2cf05d04be1d'),
  ('seed-product-6', 0, '97d6fa81-84b1-11ea-b9bb-70c94e4ebe6a'),
  ('seed-product-7', 0, 'ad8afa41-737d-11ea-b9b9-70c94e4ebe6a'),
  ('seed-product-8', 0, '568905bd-9460-11ee-9ef4-be8fe126e7b9'),
  ('seed-product-9', 0, '568905be-9460-11ee-9ef4-be8fe126e7b9');

CREATE TABLE IF NOT EXISTS shopProduct (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shopId TEXT NOT NULL,
  uuid TEXT NOT NULL,
  product_group INTEGER NOT NULL,
  parentUuid TEXT,
  name TEXT
);

CREATE INDEX IF NOT EXISTS idx_shopProduct_shopId
ON shopProduct(shopId);

CREATE INDEX IF NOT EXISTS idx_shopProduct_uuid
ON shopProduct(uuid);

CREATE INDEX IF NOT EXISTS idx_shopProduct_parent_uuid
ON shopProduct(parentUuid);

-- Минимальная инициализация: связываем сид-продукты с тестовым магазином.
-- Этого достаточно, чтобы запросы по shopProduct возвращали корректную форму данных.
DELETE FROM shopProduct
WHERE shopId = 'smoke-shop'
  AND uuid IN (
    'seed-product-1',
    'seed-product-2',
    'seed-product-3',
    'seed-product-4',
    'seed-product-5',
    'seed-product-6',
    'seed-product-7',
    'seed-product-8',
    'seed-product-9'
  );

INSERT INTO shopProduct (shopId, uuid, product_group, parentUuid, name) VALUES
  ('smoke-shop', 'seed-product-1', 0, '78ddfd78-dc52-11e8-b970-ccb0da458b5a', 'Smoke Product 1'),
  ('smoke-shop', 'seed-product-2', 0, 'bc9e7e4c-fdac-11ea-aaf2-2cf05d04be1d', 'Smoke Product 2'),
  ('smoke-shop', 'seed-product-3', 0, '0627db0b-4e39-11ec-ab27-2cf05d04be1d', 'Smoke Product 3'),
  ('smoke-shop', 'seed-product-4', 0, '2b8eb6b4-92ea-11ee-ab93-2cf05d04be1d', 'Smoke Product 4'),
  ('smoke-shop', 'seed-product-5', 0, '8a8fcb5f-9582-11ee-ab93-2cf05d04be1d', 'Smoke Product 5'),
  ('smoke-shop', 'seed-product-6', 0, '97d6fa81-84b1-11ea-b9bb-70c94e4ebe6a', 'Smoke Product 6'),
  ('smoke-shop', 'seed-product-7', 0, 'ad8afa41-737d-11ea-b9b9-70c94e4ebe6a', 'Smoke Product 7'),
  ('smoke-shop', 'seed-product-8', 0, '568905bd-9460-11ee-9ef4-be8fe126e7b9', 'Smoke Product 8'),
  ('smoke-shop', 'seed-product-9', 0, '568905be-9460-11ee-9ef4-be8fe126e7b9', 'Smoke Product 9');

CREATE TABLE IF NOT EXISTS openShops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT,
  location_lat REAL,
  location_lon REAL,
  photoCashRegisterPhoto TEXT,
  photoCabinetsPhoto TEXT,
  photoShowcasePhoto1 TEXT,
  photoShowcasePhoto2 TEXT,
  photoShowcasePhoto3 TEXT,
  photoTerritory1 TEXT,
  photoTerritory2 TEXT,
  countingMoney REAL,
  CountingMoneyMessage TEXT,
  userId TEXT,
  shopUuid TEXT,
  dateTime TEXT
);

CREATE INDEX IF NOT EXISTS idx_openShops_date_shopUuid
ON openShops(date, shopUuid);
