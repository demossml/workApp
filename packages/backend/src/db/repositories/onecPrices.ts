import type { D1Adapter } from "../../db-duckdb";

export type PriceItem = {
  sku: string;
  barcode: string | null;
  name: string | null;
  price: number;
  priceType: string;
  store: string;
  changedAt: string | null;
};

export type UpsertPricesResult = {
  inserted: number;
  updated: number;
  skipped: number;
};

export type GetPricesParams = {
  store?: string;
  priceType?: string;
  sku?: string;
  name?: string;
  updatedSince?: string;
  page: number;
  limit: number;
};

export type SaveImportLogInput = {
  store?: string;
  priceType?: string;
  itemsReceived?: number;
  itemsInserted?: number;
  itemsUpdated?: number;
  itemsSkipped?: number;
  status: "success" | "error";
  errorMessage?: string;
};

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function makeKey(sku: string, store: string, priceType: string) {
  return `${sku}::${store}::${priceType}`;
}

export async function upsertPrices(
  db: D1Adapter,
  items: PriceItem[],
): Promise<UpsertPricesResult> {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  if (items.length === 0) return { inserted, updated, skipped };

  const batches = chunkArray(items, 100);

  for (const batch of batches) {
    // Build placeholders for batch query
    const placeholders = batch.map(() => "(?, ?, ?)").join(", ");
    const flatParams: any[] = [];
    batch.forEach(item => flatParams.push(item.sku, item.store, item.priceType));

    const existingRows = await db.prepare(`
      SELECT * FROM onec_prices WHERE (sku, store, price_type) IN (${placeholders})
    `).bind(...flatParams).all<{ sku: string; store: string; price_type: string; price: number }>();

    const existingMap = new Map(
      existingRows.results.map((row: any) => [
        makeKey(row.sku, row.store, row.price_type),
        row,
      ]),
    );

    const inserts: any[] = [];
    const history: any[] = [];

    for (const item of batch) {
      const key = makeKey(item.sku, item.store, item.priceType);
      const existing = existingMap.get(key);

      if (!existing) {
        inserts.push(item.sku, item.barcode, item.name, item.price, item.priceType, item.store, item.changedAt);
        inserted++;
        continue;
      }

      if (Number(existing.price) !== item.price) {
        await db.prepare(`
          UPDATE onec_prices SET price = ?, barcode = ?, name = ?, changed_at = ?, updated_at = ?
          WHERE sku = ? AND store = ? AND price_type = ?
        `).bind(item.price, item.barcode, item.name, item.changedAt, new Date().toISOString(),
                item.sku, item.store, item.priceType).run();

        history.push(item.sku, item.store, item.priceType, existing.price ?? null, item.price,
                     item.changedAt ?? new Date().toISOString());
        updated++;
      } else {
        skipped++;
      }
    }

    if (inserts.length > 0) {
      const insertPlaceholders = [];
      for (let i = 0; i < inserts.length; i += 7) {
        insertPlaceholders.push("(?, ?, ?, ?, ?, ?, ?)");
      }
      await db.prepare(`
        INSERT INTO onec_prices (sku, barcode, name, price, price_type, store, changed_at)
        VALUES ${insertPlaceholders.join(", ")}
      `).bind(...inserts).run();
    }

    if (history.length > 0) {
      const histPlaceholders = [];
      for (let i = 0; i < history.length; i += 7) {
        histPlaceholders.push("(?, ?, ?, ?, ?, ?, ?)");
      }
      await db.prepare(`
        INSERT INTO onec_price_history (sku, store, price_type, old_price, new_price, changed_at, created_at)
        VALUES ${histPlaceholders.join(", ")}
      `).bind(...history.map((v, i) => i % 7 === 6 ? (v ?? new Date().toISOString()) : v)).run();
    }
  }

  return { inserted, updated, skipped };
}

export async function getPrices(
  db: D1Adapter,
  params: GetPricesParams,
) {
  const conditions: string[] = [];
  const values: any[] = [];

  if (params.store) { conditions.push("store = ?"); values.push(params.store); }
  if (params.priceType) { conditions.push("price_type = ?"); values.push(params.priceType); }
  if (params.sku) { conditions.push("sku LIKE ?"); values.push(`%${params.sku}%`); }
  if (params.name) { conditions.push("name LIKE ?"); values.push(`%${params.name}%`); }
  if (params.updatedSince) { conditions.push("updated_at >= ?"); values.push(params.updatedSince); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (params.page - 1) * params.limit;

  const rows = await db.prepare(`
    SELECT * FROM onec_prices ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?
  `).bind(...values, params.limit, offset).all();

  const totalRow = await db.prepare(`
    SELECT count(*) as count FROM onec_prices ${where}
  `).bind(...values).first<{ count: number }>();

  const total = totalRow?.count ?? 0;

  return {
    data: rows.results,
    page: params.page,
    limit: params.limit,
    total,
    total_pages: params.limit > 0 ? Math.ceil(total / params.limit) : 0,
  };
}

export async function getPriceBySku(
  db: D1Adapter, sku: string, store?: string, priceType?: string,
) {
  const conditions = ["sku = ?"];
  const values: any[] = [sku];
  if (store) { conditions.push("store = ?"); values.push(store); }
  if (priceType) { conditions.push("price_type = ?"); values.push(priceType); }

  return db.prepare(`
    SELECT * FROM onec_prices WHERE ${conditions.join(" AND ")} ORDER BY updated_at DESC
  `).bind(...values).all();
}

export async function getPriceHistory(
  db: D1Adapter, sku: string, store?: string, limit = 50,
) {
  const conditions = ["sku = ?"];
  const values: any[] = [sku];
  if (store) { conditions.push("store = ?"); values.push(store); }

  return db.prepare(`
    SELECT * FROM onec_price_history WHERE ${conditions.join(" AND ")} ORDER BY changed_at DESC LIMIT ?
  `).bind(...values, limit).all();
}

export async function saveImportLog(
  db: D1Adapter, input: SaveImportLogInput,
) {
  await db.prepare(`
    INSERT INTO onec_import_log (store, price_type, items_received, items_inserted, items_updated, items_skipped, status, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    input.store ?? null, input.priceType ?? null,
    input.itemsReceived ?? null, input.itemsInserted ?? null,
    input.itemsUpdated ?? null, input.itemsSkipped ?? null,
    input.status, input.errorMessage ?? null,
  ).run();
}

export async function getImportLogs(db: D1Adapter, limit = 20) {
  return db.prepare(`SELECT * FROM onec_import_log ORDER BY received_at DESC LIMIT ?`)
    .bind(limit).all();
}

export async function getOnecStats(db: D1Adapter) {
  const totalPrices = await db.prepare(`SELECT CAST(count(*) AS INTEGER) as count FROM onec_prices`).first<{ count: number }>();
  const stores = await db.prepare(`SELECT CAST(count(DISTINCT store) AS INTEGER) as count FROM onec_prices`).first<{ count: number }>();
  const lastImport = await db.prepare(`SELECT * FROM onec_import_log ORDER BY received_at DESC LIMIT 1`).first<any>();

  return {
    total_prices: totalPrices?.count ?? 0,
    stores: stores?.count ?? 0,
    last_import_at: lastImport?.received_at ?? null,
    last_import_status: lastImport?.status ?? null,
  };
}
