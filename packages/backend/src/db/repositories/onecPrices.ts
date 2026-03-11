import { and, desc, eq, gte, like, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import {
	onecImportLog,
	onecPriceHistory,
	onecPrices,
} from "../schema/onecPrices";

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
	db: DrizzleD1Database<Record<string, unknown>>,
	items: PriceItem[],
): Promise<UpsertPricesResult> {
	let inserted = 0;
	let updated = 0;
	let skipped = 0;

	if (items.length === 0) {
		return { inserted, updated, skipped };
	}

	const batches = chunkArray(items, 100);

	for (const batch of batches) {
		const conditions = batch.map((item) =>
			and(
				eq(onecPrices.sku, item.sku),
				eq(onecPrices.store, item.store),
				eq(onecPrices.priceType, item.priceType),
			),
		);

		const existingRows = conditions.length
			? await db
					.select()
					.from(onecPrices)
					.where(conditions.length === 1 ? conditions[0] : or(...conditions))
					.all()
			: [];

		const existingMap = new Map(
			existingRows.map((row) => [
				makeKey(row.sku, row.store, row.priceType),
				row,
			]),
		);

		const inserts = [] as Array<{
			sku: string;
			barcode: string | null;
			name: string | null;
			price: number;
			priceType: string;
			store: string;
			changedAt: string | null;
		}>;

		const history = [] as Array<{
			sku: string;
			store: string;
			priceType: string;
			oldPrice: number | null;
			newPrice: number;
			changedAt: string;
		}>;

		for (const item of batch) {
			const key = makeKey(item.sku, item.store, item.priceType);
			const existing = existingMap.get(key);

			if (!existing) {
				inserts.push({
					sku: item.sku,
					barcode: item.barcode,
					name: item.name,
					price: item.price,
					priceType: item.priceType,
					store: item.store,
					changedAt: item.changedAt,
				});
				inserted++;
				continue;
			}

			if (Number(existing.price) !== item.price) {
				await db
					.update(onecPrices)
					.set({
						price: item.price,
						barcode: item.barcode,
						name: item.name,
						changedAt: item.changedAt,
						updatedAt: new Date().toISOString(),
					})
					.where(
						and(
							eq(onecPrices.sku, item.sku),
							eq(onecPrices.store, item.store),
							eq(onecPrices.priceType, item.priceType),
						),
					)
					.run();

				history.push({
					sku: item.sku,
					store: item.store,
					priceType: item.priceType,
					oldPrice: existing.price ?? null,
					newPrice: item.price,
					changedAt: item.changedAt ?? new Date().toISOString(),
				});

				updated++;
			} else {
				skipped++;
			}
		}

		if (inserts.length > 0) {
			await db.insert(onecPrices).values(inserts).run();
		}

		if (history.length > 0) {
			await db.insert(onecPriceHistory).values(history).run();
		}
	}

	return { inserted, updated, skipped };
}

export async function getPrices(
	db: DrizzleD1Database<Record<string, unknown>>,
	params: GetPricesParams,
) {
	const filters: SQL[] = [];

	if (params.store) {
		filters.push(eq(onecPrices.store, params.store));
	}
	if (params.priceType) {
		filters.push(eq(onecPrices.priceType, params.priceType));
	}
	if (params.sku) {
		filters.push(like(onecPrices.sku, `%${params.sku}%`));
	}
	if (params.name) {
		filters.push(like(onecPrices.name, `%${params.name}%`));
	}
	if (params.updatedSince) {
		filters.push(gte(onecPrices.updatedAt, params.updatedSince));
	}

	const whereClause = filters.length > 0 ? and(...filters) : undefined;
	const offset = (params.page - 1) * params.limit;

	const rows = await db
		.select()
		.from(onecPrices)
		.where(whereClause)
		.orderBy(desc(onecPrices.updatedAt))
		.limit(params.limit)
		.offset(offset)
		.all();

	const totalRow = await db
		.select({ count: sql<number>`count(*)` })
		.from(onecPrices)
		.where(whereClause)
		.get();

	const total = totalRow?.count ?? 0;

	return {
		data: rows,
		page: params.page,
		limit: params.limit,
		total,
		total_pages: params.limit > 0 ? Math.ceil(total / params.limit) : 0,
	};
}

export async function getPriceBySku(
	db: DrizzleD1Database<Record<string, unknown>>,
	sku: string,
	store?: string,
	priceType?: string,
) {
	const filters = [eq(onecPrices.sku, sku)];

	if (store) {
		filters.push(eq(onecPrices.store, store));
	}
	if (priceType) {
		filters.push(eq(onecPrices.priceType, priceType));
	}

	return db
		.select()
		.from(onecPrices)
		.where(and(...filters))
		.orderBy(desc(onecPrices.updatedAt))
		.all();
}

export async function getPriceHistory(
	db: DrizzleD1Database<Record<string, unknown>>,
	sku: string,
	store?: string,
	limit = 50,
) {
	const filters = [eq(onecPriceHistory.sku, sku)];

	if (store) {
		filters.push(eq(onecPriceHistory.store, store));
	}

	return db
		.select()
		.from(onecPriceHistory)
		.where(and(...filters))
		.orderBy(desc(onecPriceHistory.changedAt))
		.limit(limit)
		.all();
}

export async function saveImportLog(
	db: DrizzleD1Database<Record<string, unknown>>,
	input: SaveImportLogInput,
) {
	await db
		.insert(onecImportLog)
		.values({
			store: input.store ?? null,
			priceType: input.priceType ?? null,
			itemsReceived: input.itemsReceived ?? null,
			itemsInserted: input.itemsInserted ?? null,
			itemsUpdated: input.itemsUpdated ?? null,
			itemsSkipped: input.itemsSkipped ?? null,
			status: input.status,
			errorMessage: input.errorMessage ?? null,
		})
		.run();
}

export async function getImportLogs(
	db: DrizzleD1Database<Record<string, unknown>>,
	limit = 20,
) {
	return db
		.select()
		.from(onecImportLog)
		.orderBy(desc(onecImportLog.receivedAt))
		.limit(limit)
		.all();
}

export async function getOnecStats(
	db: DrizzleD1Database<Record<string, unknown>>,
) {
	const totalPricesRow = await db
		.select({ count: sql<number>`count(*)` })
		.from(onecPrices)
		.get();

	const storesRow = await db
		.select({ count: sql<number>`count(distinct ${onecPrices.store})` })
		.from(onecPrices)
		.get();

	const lastImport = await db
		.select()
		.from(onecImportLog)
		.orderBy(desc(onecImportLog.receivedAt))
		.get();

	return {
		total_prices: totalPricesRow?.count ?? 0,
		stores: storesRow?.count ?? 0,
		last_import_at: lastImport?.receivedAt ?? null,
		last_import_status: lastImport?.status ?? null,
	};
}
