// tables.ts
import { integer, text } from "drizzle-orm/sqlite-core";
import { sqliteTable } from "./_table";

export const accessories = sqliteTable("accessories", {
	id: integer("id").primaryKey({ autoIncrement: true }),

	uuid: text("uuid").notNull(),

	// TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	created_at: text("created_at").default("CURRENT_TIMESTAMP"),
	updated_at: text("updated_at").default("CURRENT_TIMESTAMP"),
});
