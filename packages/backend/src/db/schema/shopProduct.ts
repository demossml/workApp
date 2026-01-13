// tables.ts
import { integer, text, index } from "drizzle-orm/sqlite-core";
import { sqliteTable } from "./_table";

export const shopProduct = sqliteTable(
	"shopProduct",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),

		shopId: text("shopId").notNull(),
		uuid: text("uuid").notNull(),

		product_group: integer("product_group").notNull(),
		parentUuid: text("parentUuid"),
		name: text("name"),
	},
	(table) => ({
		shopIdIdx: index("idx_shopProduct_shopId").on(table.shopId),
		uuidIdx: index("idx_shopProduct_uuid").on(table.uuid),
	}),
);
