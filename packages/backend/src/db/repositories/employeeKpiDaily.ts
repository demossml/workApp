import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";

type ShopDate = { shopId: string; date: string };

export async function ensureEmployeeKpiDailyTable(
	db: D1Database,
): Promise<void> {
	await db.batch([
		db.prepare(
			"CREATE TABLE IF NOT EXISTS employee_kpi_daily (date TEXT NOT NULL, shop_uuid TEXT NOT NULL, employee_uuid TEXT NOT NULL, revenue REAL NOT NULL DEFAULT 0, checks INTEGER NOT NULL DEFAULT 0, avg_check REAL NOT NULL DEFAULT 0, refunds REAL NOT NULL DEFAULT 0, sold_qty REAL NOT NULL DEFAULT 0, shift_hours REAL NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (date, shop_uuid, employee_uuid))",
		),
		db.prepare(
			"CREATE INDEX IF NOT EXISTS idx_employee_kpi_daily_employee_date ON employee_kpi_daily (employee_uuid, date)",
		),
		db.prepare(
			"CREATE INDEX IF NOT EXISTS idx_employee_kpi_daily_shop_date ON employee_kpi_daily (shop_uuid, date)",
		),
	]);
}

function normalizeShopDates(input: ShopDate[]): ShopDate[] {
	const ymd = /^\d{4}-\d{2}-\d{2}$/;
	const map = new Map<string, ShopDate>();
	for (const item of input || []) {
		const shopId = String(item.shopId || "").trim();
		const date = String(item.date || "").trim();
		if (!shopId || !ymd.test(date)) continue;
		map.set(`${shopId}:${date}`, { shopId, date });
	}
	return Array.from(map.values());
}

export async function recomputeEmployeeKpiDailyForShopDates(
	db: D1Database,
	shopDatesInput: ShopDate[],
): Promise<void> {
	const shopDates = normalizeShopDates(shopDatesInput);
	if (shopDates.length === 0) return;
	await ensureEmployeeKpiDailyTable(db);

	const shopIds = Array.from(new Set(shopDates.map((item) => item.shopId)));
	const dateKeys = shopDates.map((item) => item.date).sort((a, b) =>
		a.localeCompare(b),
	);
	const minDate = dateKeys[0];
	const maxDate = dateKeys[dateKeys.length - 1];
	const filterKeys = new Set(shopDates.map((item) => `${item.shopId}:${item.date}`));
	const placeholders = shopIds.map(() => "?").join(", ");

	const receiptsStmt = db.prepare(
		`SELECT
			substr(close_date, 1, 10) as dateKey,
			shop_id as shopId,
			open_user_uuid as employeeUuid,
			SUM(CASE WHEN type = 'SELL' THEN total ELSE 0 END) as totalSell,
			SUM(CASE WHEN type = 'PAYBACK' THEN ABS(total) ELSE 0 END) as totalRefund,
			SUM(CASE WHEN type IN ('SELL','PAYBACK') THEN 1 ELSE 0 END) as checksCount
		FROM receipts
		WHERE close_date >= ? AND close_date <= ?
			AND shop_id IN (${placeholders})
			AND open_user_uuid IS NOT NULL
			AND open_user_uuid != ''
		GROUP BY dateKey, shopId, employeeUuid`,
	);

	const soldQtyStmt = db.prepare(
		`SELECT
			substr(r.close_date, 1, 10) as dateKey,
			r.shop_id as shopId,
			r.open_user_uuid as employeeUuid,
			SUM(CASE WHEN rp.quantity > 0 THEN rp.quantity ELSE 0 END) as soldQty
		FROM receipt_positions rp
		JOIN receipts r ON r.id = rp.receipt_id
		WHERE r.close_date >= ? AND r.close_date <= ?
			AND r.shop_id IN (${placeholders})
			AND r.open_user_uuid IS NOT NULL
			AND r.open_user_uuid != ''
		GROUP BY dateKey, shopId, employeeUuid`,
	);

	const shiftStmt = db.prepare(
		`SELECT
			substr(close_date, 1, 10) as dateKey,
			shop_id as shopId,
			open_user_uuid as employeeUuid,
			MAX(
				0,
				(julianday(MAX(close_date)) - julianday(MIN(close_date))) * 24.0
			) as shiftHours
		FROM index_documents
		WHERE close_date >= ? AND close_date <= ?
			AND shop_id IN (${placeholders})
			AND open_user_uuid IS NOT NULL
			AND open_user_uuid != ''
			AND type IN ('OPEN_SESSION','CLOSE_SESSION','SELL','PAYBACK','Z_REPORT')
		GROUP BY dateKey, shopId, employeeUuid`,
	);

	const sinceTs = `${minDate}T00:00:00.000+0000`;
	const untilTs = `${maxDate}T23:59:59.999+0000`;
	const [receiptsRows, soldQtyRows, shiftRows] = await Promise.all([
		receiptsStmt.bind(sinceTs, untilTs, ...shopIds).all<{
			dateKey: string;
			shopId: string;
			employeeUuid: string;
			totalSell: number | null;
			totalRefund: number | null;
			checksCount: number | null;
		}>(),
		soldQtyStmt.bind(sinceTs, untilTs, ...shopIds).all<{
			dateKey: string;
			shopId: string;
			employeeUuid: string;
			soldQty: number | null;
		}>(),
		shiftStmt.bind(sinceTs, untilTs, ...shopIds).all<{
			dateKey: string;
			shopId: string;
			employeeUuid: string;
			shiftHours: number | null;
		}>(),
	]);

	const rows = new Map<
		string,
		{
			date: string;
			shopUuid: string;
			employeeUuid: string;
			revenue: number;
			checks: number;
			avgCheck: number;
			refunds: number;
			soldQty: number;
			shiftHours: number;
		}
	>();

	for (const row of receiptsRows.results || []) {
		const key = `${row.shopId}:${row.dateKey}`;
		if (!filterKeys.has(key)) continue;
		const employeeUuid = String(row.employeeUuid || "").trim();
		if (!employeeUuid) continue;
		const totalSell = Number(row.totalSell || 0);
		const refunds = Number(row.totalRefund || 0);
		const checks = Number(row.checksCount || 0);
		const revenue = totalSell - refunds;
		const metricKey = `${row.dateKey}:${row.shopId}:${employeeUuid}`;
		rows.set(metricKey, {
			date: row.dateKey,
			shopUuid: row.shopId,
			employeeUuid,
			revenue,
			checks,
			avgCheck: checks > 0 ? revenue / checks : 0,
			refunds,
			soldQty: 0,
			shiftHours: 0,
		});
	}

	for (const row of soldQtyRows.results || []) {
		const key = `${row.shopId}:${row.dateKey}`;
		if (!filterKeys.has(key)) continue;
		const employeeUuid = String(row.employeeUuid || "").trim();
		if (!employeeUuid) continue;
		const metricKey = `${row.dateKey}:${row.shopId}:${employeeUuid}`;
		const existing = rows.get(metricKey);
		if (!existing) continue;
		existing.soldQty = Number(row.soldQty || 0);
		rows.set(metricKey, existing);
	}

	for (const row of shiftRows.results || []) {
		const key = `${row.shopId}:${row.dateKey}`;
		if (!filterKeys.has(key)) continue;
		const employeeUuid = String(row.employeeUuid || "").trim();
		if (!employeeUuid) continue;
		const metricKey = `${row.dateKey}:${row.shopId}:${employeeUuid}`;
		const existing = rows.get(metricKey);
		if (!existing) continue;
		existing.shiftHours = Number(row.shiftHours || 0);
		rows.set(metricKey, existing);
	}

	const statements: D1PreparedStatement[] = [];
	const deleteStmt = db.prepare(
		"DELETE FROM employee_kpi_daily WHERE date = ? AND shop_uuid = ?",
	);
	for (const { shopId, date } of shopDates) {
		statements.push(deleteStmt.bind(date, shopId));
	}

	const upsertStmt = db.prepare(
		"INSERT INTO employee_kpi_daily (date, shop_uuid, employee_uuid, revenue, checks, avg_check, refunds, sold_qty, shift_hours, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')) ON CONFLICT(date, shop_uuid, employee_uuid) DO UPDATE SET revenue = excluded.revenue, checks = excluded.checks, avg_check = excluded.avg_check, refunds = excluded.refunds, sold_qty = excluded.sold_qty, shift_hours = excluded.shift_hours, updated_at = datetime('now')",
	);

	for (const row of rows.values()) {
		statements.push(
			upsertStmt.bind(
				row.date,
				row.shopUuid,
				row.employeeUuid,
				row.revenue,
				row.checks,
				row.avgCheck,
				row.refunds,
				row.soldQty,
				row.shiftHours,
			),
		);
	}

	if (statements.length > 0) {
		await db.batch(statements);
	}
}
