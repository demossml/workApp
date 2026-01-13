// tables.ts
import { integer, text } from "drizzle-orm/sqlite-core";
import { sqliteTable } from "./_table";

export const salaryBonus = sqliteTable("salary_bonus", {
	id: integer("id").primaryKey({ autoIncrement: true }),

	// TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	// В SQLite обычно храним как TEXT
	date: text("date").default("CURRENT_TIMESTAMP"),

	salary: integer("salary").notNull(),
	bonus: integer("bonus").notNull(),
});
