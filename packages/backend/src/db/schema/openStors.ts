// tables.ts
import { integer, text, real, index } from "drizzle-orm/sqlite-core";
import { sqliteTable } from "./_table";

export const openStors = sqliteTable(
	"openStors",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		date: text("date").notNull(),
		userId: text("userId").notNull(),
		shopUuid: text("shopUuid"),
		openedByName: text("openedByName"),
		cash: real("cash"),
		sign: text("sign", {
			enum: ["+", "-"],
		}),
		ok: integer("ok"),
	},
	(table) => ({
		userIdIdx: index("openStors_userId_idx").on(table.userId),
		shopUuidIdx: index("openStors_shopUuid_idx").on(table.shopUuid),
		dateIdx: index("openStors_date_idx").on(table.date),
	}),
);
