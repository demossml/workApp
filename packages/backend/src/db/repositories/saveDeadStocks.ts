import type { DeadStockItem } from "../../types";
import type { AppDB } from "../../db-duckdb.js";

export const saveDeadStocks = async (
	db: AppDB,
	shopUuid: string,
	items: DeadStockItem[],
): Promise<void> => {
	if (!shopUuid || !Array.isArray(items) || items.length === 0) {
		throw new Error("Invalid parameters for saveDeadStocks");
	}

	const document_number = crypto.randomUUID();
	const d = new Date();
	const document_date = [
		String(d.getDate()).padStart(2, "0"),
		String(d.getMonth() + 1).padStart(2, "0"),
		d.getFullYear(),
	].join(".");

	const snapshot_date = new Date().toISOString().slice(0, 10);

	for (const item of items) {
		await db
			.prepare(
				`INSERT INTO dead_stocks (shop_uuid, name, quantity, sold, last_sale_date, mark, move_count, move_to_store, snapshot_date)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				shopUuid,
				item.name,
				item.quantity,
				item.sold,
				item.lastSaleDate,
				item.mark ?? null,
				item.moveCount ?? null,
				item.moveToStore ?? null,
				snapshot_date,
			)
			.run();
	}
};
