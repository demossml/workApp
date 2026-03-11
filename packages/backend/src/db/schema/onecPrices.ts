import { index, integer, real, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { sqliteTable } from "./_table";

export const onecPrices = sqliteTable(
	"onec_prices",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		sku: text("sku").notNull(),
		barcode: text("barcode"),
		name: text("name"),
		price: real("price").notNull(),
		priceType: text("price_type").notNull(),
		store: text("store").notNull(),
		changedAt: text("changed_at"),
		createdAt: text("created_at")
			.notNull()
			.default(sql`(datetime('now'))`),
		updatedAt: text("updated_at")
			.notNull()
			.default(sql`(datetime('now'))`),
	},
	(table) => ({
		skuStoreTypeUidx: uniqueIndex("onec_prices_sku_store_type_uidx").on(
			table.sku,
			table.store,
			table.priceType,
		),
		skuStoreTypeIdx: index("idx_onec_prices_sku_store_type").on(
			table.sku,
			table.store,
			table.priceType,
		),
		storeIdx: index("idx_onec_prices_store").on(table.store),
		priceTypeIdx: index("idx_onec_prices_price_type").on(table.priceType),
		skuIdx: index("idx_onec_prices_sku").on(table.sku),
	}),
);

export const onecPriceHistory = sqliteTable(
	"onec_price_history",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		sku: text("sku").notNull(),
		store: text("store").notNull(),
		priceType: text("price_type").notNull(),
		oldPrice: real("old_price"),
		newPrice: real("new_price").notNull(),
		changedAt: text("changed_at")
			.notNull()
			.default(sql`(datetime('now'))`),
	},
	(table) => ({
		skuStoreIdx: index("idx_onec_price_history_sku_store").on(
			table.sku,
			table.store,
		),
	}),
);

export const onecImportLog = sqliteTable(
	"onec_import_log",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		store: text("store"),
		priceType: text("price_type"),
		itemsReceived: integer("items_received"),
		itemsInserted: integer("items_inserted"),
		itemsUpdated: integer("items_updated"),
		itemsSkipped: integer("items_skipped"),
		status: text("status").notNull(),
		errorMessage: text("error_message"),
		receivedAt: text("received_at")
			.notNull()
			.default(sql`(datetime('now'))`),
	},
	(table) => ({
		storeIdx: index("idx_onec_import_log_store").on(table.store),
		receivedAtIdx: index("idx_onec_import_log_received_at").on(
			table.receivedAt,
		),
	}),
);

export type OnecPricesInsert = typeof onecPrices.$inferInsert;
export type OnecPricesSelect = typeof onecPrices.$inferSelect;
export type OnecPriceHistoryInsert = typeof onecPriceHistory.$inferInsert;
export type OnecPriceHistorySelect = typeof onecPriceHistory.$inferSelect;
export type OnecImportLogInsert = typeof onecImportLog.$inferInsert;
export type OnecImportLogSelect = typeof onecImportLog.$inferSelect;
