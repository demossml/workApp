import type { D1Database } from "@cloudflare/workers-types";
import type { IndexDocument } from "../../evotor/types";

export type SalesHourlyRow = {
	shopId: string;
	dayOfWeek: number;
	hour: number;
	revenue: number;
	checks: number;
};

export async function ensureSalesHourlyTable(db: D1Database): Promise<void> {
	await db
		.prepare(
			"CREATE TABLE IF NOT EXISTS sales_hourly (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id TEXT NOT NULL, day_of_week INTEGER NOT NULL, hour INTEGER NOT NULL, revenue REAL NOT NULL DEFAULT 0, checks INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime('now')))"
		)
		.run();
	await db
		.prepare(
			"CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_hourly_shop_day_hour ON sales_hourly (shop_id, day_of_week, hour)"
		)
		.run();
}

export function buildSalesHourlyRows(
	documents: IndexDocument[],
): SalesHourlyRow[] {
	const rows = new Map<string, SalesHourlyRow>();

	for (const doc of documents) {
		if (doc.type !== "SELL" && doc.type !== "PAYBACK") continue;
		const closeDate = new Date(doc.closeDate);
		if (Number.isNaN(closeDate.getTime())) continue;
		const dayOfWeek = closeDate.getUTCDay();
		const hour = closeDate.getUTCHours();

		let revenueDelta = 0;
		for (const trans of doc.transactions || []) {
			if (trans.type !== "PAYMENT") continue;
			const raw = Number(trans.sum || 0);
			if (!Number.isFinite(raw) || raw === 0) continue;
			revenueDelta += doc.type === "PAYBACK" ? -Math.abs(raw) : raw;
		}

		const key = `${doc.shop_id}:${dayOfWeek}:${hour}`;
		const existing = rows.get(key) || {
			shopId: doc.shop_id,
			dayOfWeek,
			hour,
			revenue: 0,
			checks: 0,
		};
		existing.revenue += revenueDelta;
		if (doc.type === "SELL") {
			existing.checks += 1;
		}
		rows.set(key, existing);
	}

	return Array.from(rows.values());
}

export async function upsertSalesHourlyRows(
	db: D1Database,
	rows: SalesHourlyRow[],
): Promise<void> {
	if (rows.length === 0) return;
	await ensureSalesHourlyTable(db);

	const stmt = db.prepare(
		"INSERT INTO sales_hourly (shop_id, day_of_week, hour, revenue, checks, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now')) ON CONFLICT(shop_id, day_of_week, hour) DO UPDATE SET revenue = revenue + excluded.revenue, checks = checks + excluded.checks, updated_at = datetime('now')"
	);

	for (const row of rows) {
		await stmt
			.bind(row.shopId, row.dayOfWeek, row.hour, row.revenue, row.checks)
			.run();
	}
}

export async function getSalesHourly(
	db: D1Database,
	shopIds?: string[],
): Promise<SalesHourlyRow[]> {
	await ensureSalesHourlyTable(db);
	if (!shopIds || shopIds.length === 0) {
		const result = await db
			.prepare(
				"SELECT shop_id, day_of_week, hour, revenue, checks FROM sales_hourly"
			)
			.all();
		return (result.results || []).map((row) => ({
			shopId: String((row as any).shop_id),
			dayOfWeek: Number((row as any).day_of_week),
			hour: Number((row as any).hour),
			revenue: Number((row as any).revenue),
			checks: Number((row as any).checks),
		}));
	}

	const placeholders = shopIds.map(() => "?").join(", ");
	const result = await db
		.prepare(
			`SELECT shop_id, day_of_week, hour, revenue, checks FROM sales_hourly WHERE shop_id IN (${placeholders})`
		)
		.bind(...shopIds)
		.all();
	return (result.results || []).map((row) => ({
		shopId: String((row as any).shop_id),
		dayOfWeek: Number((row as any).day_of_week),
		hour: Number((row as any).hour),
		revenue: Number((row as any).revenue),
		checks: Number((row as any).checks),
	}));
}
