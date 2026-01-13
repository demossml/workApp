// tables.ts
import {
	integer,
	text,
	integer as sqliteInteger,
} from "drizzle-orm/sqlite-core";
import { sqliteTable } from "./_table";

export const products = sqliteTable("products", {
	id: integer("id").primaryKey({ autoIncrement: true }),

	uuid: text("uuid"),

	// BOOLEAN в SQLite хранится как INTEGER (0 / 1)
	group_x: sqliteInteger("group_x", { mode: "boolean" }).notNull(),

	parentUuid: text("parentUuid"),
});
