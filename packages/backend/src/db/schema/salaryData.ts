// tables.ts
import { integer, text } from "drizzle-orm/sqlite-core";
import { sqliteTable } from "./_table";

export const salaryData = sqliteTable("salaryData", {
	id: integer("id").primaryKey({ autoIncrement: true }),

	date: text("date").notNull(),
	shopUuid: text("shopUuid").notNull(),
	employeeUuid: text("employeeUuid").notNull(),

	bonusAccessories: integer("bonusAccessories").notNull(),
	dataPlan: integer("dataPlan").notNull(),
	salesDataVape: integer("salesDataVape").notNull(),
	bonusPlan: integer("bonusPlan").notNull(),
	totalBonus: integer("totalBonus").notNull(),
});
