// tables.ts
import { integer, text, real } from "drizzle-orm/sqlite-core";
import { sqliteTable } from "./_table";

export const plan = sqliteTable("plan", {
	id: integer("id").primaryKey({ autoIncrement: true }),

	date: text("date").notNull(),
	shopUuid: text("shopUuid").notNull(),

	// REAL NOT NULL
	sum: real("sum").notNull(),
});
