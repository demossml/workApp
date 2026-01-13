// tables.ts
import { integer, text, index } from "drizzle-orm/sqlite-core";
import { sqliteTable } from "./_table";

export const schedule = sqliteTable(
	"schedule",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),

		shopUuid: text("shopUuid").notNull(),
		employeeUuid: text("employeeUuid"), // NULL

		date: text("date").notNull(),
		shiftType: text("shiftType"), // NULL
	},
	(table) => ({
		shopUuidIdx: index("idx_schedule_shopUuid").on(table.shopUuid),
		dateIdx: index("idx_schedule_date").on(table.date),
	}),
);
