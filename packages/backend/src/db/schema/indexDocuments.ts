// tables.ts
import { integer, text, index, unique } from "drizzle-orm/sqlite-core";
import { sqliteTable } from "./_table";

export const indexDocuments = sqliteTable(
	"index_documents",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),

		number: text("number").notNull(),
		shop_id: text("shop_id").notNull(),

		close_date: text("close_date"),
		open_user_uuid: text("open_user_uuid"),
		type: text("type"),
		transactions: text("transactions"),
	},
	(table) => ({
		// UNIQUE(number, shop_id)
		numberShopUnique: unique("index_documents_number_shop_id_unique").on(
			table.number,
			table.shop_id,
		),

		// Индексы
		shopIdIdx: index("idx_index_documents_shop_id").on(table.shop_id),
		numberIdx: index("idx_index_documents_number").on(table.number),
		typeIdx: index("idx_index_documents_type").on(table.type),
	}),
);
