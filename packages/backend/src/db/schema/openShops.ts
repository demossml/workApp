// tables.ts
import { integer, text, real } from "drizzle-orm/sqlite-core";
import { sqliteTable } from "./_table";

export const openShops = sqliteTable("openShops", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	date: text("date"),
	location_lat: real("location_lat"),
	location_lon: real("location_lon"),
	photoCashRegisterPhoto: text("photoCashRegisterPhoto"),
	photoCabinetsPhoto: text("photoCabinetsPhoto"),
	photoShowcasePhoto1: text("photoShowcasePhoto1"),
	photoShowcasePhoto2: text("photoShowcasePhoto2"),
	photoShowcasePhoto3: text("photoShowcasePhoto3"),
	photoTerritory1: text("photoTerritory1"),
	photoTerritory2: text("photoTerritory2"),
	countingMoney: real("countingMoney"),
	CountingMoneyMessage: text("CountingMoneyMessage"),
	userId: text("userId"),
	shopUuid: text("shopUuid"),
	dateTime: text("dateTime"),
});
