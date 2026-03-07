import type { D1Database, R2Bucket } from "@cloudflare/workers-types";

let schemaEnsured = false;

async function ensureOpenStorsSchema(db: D1Database): Promise<void> {
	if (schemaEnsured) return;

	await db
		.prepare(
			"CREATE TABLE IF NOT EXISTS openStors (" +
				"id INTEGER PRIMARY KEY AUTOINCREMENT, " +
				"date TEXT NOT NULL, " +
				"userId TEXT NOT NULL, " +
				"shopUuid TEXT, " +
				"openedByName TEXT, " +
				"cash REAL, " +
				"sign TEXT CHECK(sign IN ('+', '-')), " +
				"ok INTEGER" +
				");",
		)
		.run();

	try {
		await db.prepare("ALTER TABLE openStors ADD COLUMN shopUuid TEXT").run();
	} catch {}
	try {
		await db.prepare("ALTER TABLE openStors ADD COLUMN openedByName TEXT").run();
	} catch {}

	schemaEnsured = true;
}

const getUtcRangeByDateDDMMYYYY = (dateDDMMYYYY: string) => {
	const [day, month, year] = dateDDMMYYYY.split("-").map(Number);
	const startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0)).toISOString();
	const endDate = new Date(
		Date.UTC(year, month - 1, day, 23, 59, 59),
	).toISOString();
	return { startDate, endDate };
};

export async function createOpenStorsTable(db: D1Database): Promise<void> {
	try {
		await ensureOpenStorsSchema(db);
	} catch (err) {
		console.error("Ошибка при создании таблицы:", err);
	}
}

export async function updateOpenStore(
	db: D1Database,
	userId: string,
	shopUuid: string,
	data: { cash: number | null; sign: string | null; ok: number | null },
): Promise<void> {
	try {
		await ensureOpenStorsSchema(db);
		await db
			.prepare(
				"UPDATE openStors " +
					"SET cash = ?, sign = ?, ok = ? " +
					"WHERE userId = ? AND shopUuid = ? " +
					"ORDER BY id DESC " +
					"LIMIT 1",
			)
			.bind(data.cash, data.sign, data.ok, userId, shopUuid)
			.run();
	} catch (err) {
		console.error("Ошибка при обновлении openStors:", err);
	}
}

export async function saveOpenStorsTable(
	db: D1Database,
	data: {
		date: string;
		userId: string;
		shopUuid: string;
		openedByName?: string;
		cash?: number | null;
		sign?: string | null;
		ok?: number | null;
	},
): Promise<void> {
	try {
		await ensureOpenStorsSchema(db);
		await db
			.prepare(
				"INSERT INTO openStors (date, userId, shopUuid, openedByName, cash, sign, ok) VALUES (?, ?, ?, ?, ?, ?, ?)",
			)
			.bind(
				data.date,
				data.userId,
				data.shopUuid,
				data.openedByName ?? null,
				data.cash ?? null,
				data.sign ?? null,
				data.ok ?? null,
			)
			.run();
	} catch (err) {
		console.error("Ошибка при сохранении данных в openStors:", err);
	}
}

export async function isOpenStoreExists(
	db: D1Database,
	userId: string,
	shopUuid: string,
	dateDDMMYYYY: string,
): Promise<boolean> {
	try {
		await ensureOpenStorsSchema(db);
		const { startDate, endDate } = getUtcRangeByDateDDMMYYYY(dateDDMMYYYY);

		const res = await db
			.prepare(
				`SELECT COUNT(*) AS count 
				 FROM openStors 
				 WHERE userId = ? 
				   AND shopUuid = ?
				   AND date BETWEEN ? AND ? 
				   AND (cash IS NOT NULL OR sign IS NOT NULL OR ok IS NOT NULL)`,
			)
			.bind(userId, shopUuid, startDate, endDate)
			.first<{ count: number }>();

		const count = res?.count ?? 0;

		return count > 0;
	} catch (err) {
		console.error("Ошибка при проверке открытия магазина:", err);
		return false;
	}
}

export async function getLatestShopOpeningForDate(
	db: D1Database,
	shopUuid: string,
	dateDDMMYYYY: string,
): Promise<{ userId: string; openedByName: string | null; date: string } | null> {
	try {
		await ensureOpenStorsSchema(db);
		const { startDate, endDate } = getUtcRangeByDateDDMMYYYY(dateDDMMYYYY);
		const row = await db
			.prepare(
				`SELECT userId, openedByName, date
				FROM openStors
				WHERE shopUuid = ? AND date BETWEEN ? AND ?
				ORDER BY date DESC
				LIMIT 1`,
			)
			.bind(shopUuid, startDate, endDate)
			.first<{ userId: string; openedByName: string | null; date: string }>();
		return row ?? null;
	} catch (err) {
		console.error("Ошибка при получении статуса открытия магазина:", err);
		return null;
	}
}

export async function getOpeningsByDate(
	db: D1Database,
	dateDDMMYYYY: string,
): Promise<Array<{ shopUuid: string; userId: string; openedByName: string | null; date: string }>> {
	try {
		await ensureOpenStorsSchema(db);
		const { startDate, endDate } = getUtcRangeByDateDDMMYYYY(dateDDMMYYYY);
		const result = await db
			.prepare(
				`SELECT shopUuid, userId, openedByName, date
				FROM openStors
				WHERE shopUuid IS NOT NULL AND date BETWEEN ? AND ?
				ORDER BY date DESC`,
			)
			.bind(startDate, endDate)
			.all<{ shopUuid: string; userId: string; openedByName: string | null; date: string }>();

		return (result.results ?? []) as Array<{
			shopUuid: string;
			userId: string;
			openedByName: string | null;
			date: string;
		}>;
	} catch (err) {
		console.error("Ошибка при получении открытий за дату:", err);
		return [];
	}
}

export async function getLatestUserOpeningForDate(
	db: D1Database,
	userId: string,
	dateDDMMYYYY: string,
): Promise<{ shopUuid: string; openedByName: string | null; date: string } | null> {
	try {
		await ensureOpenStorsSchema(db);
		const { startDate, endDate } = getUtcRangeByDateDDMMYYYY(dateDDMMYYYY);
		const row = await db
			.prepare(
				`SELECT shopUuid, openedByName, date
				FROM openStors
				WHERE userId = ? AND shopUuid IS NOT NULL AND date BETWEEN ? AND ?
				ORDER BY date DESC
				LIMIT 1`,
			)
			.bind(userId, startDate, endDate)
			.first<{ shopUuid: string; openedByName: string | null; date: string }>();
		return row ?? null;
	} catch (err) {
		console.error("Ошибка при получении открытия пользователя за дату:", err);
		return null;
	}
}

export async function getOpenStoreDetails(
	db: D1Database,
	r2: R2Bucket,
	userId: string,
	shopUuid: string,
	dateDDMMYYYY: string,
): Promise<{
	exists: boolean;
	openTime?: string;
	hasPhotos?: boolean;
	photoCount?: number;
	hasCashCheck?: boolean;
	completionPercent?: number;
} | null> {
	try {
		await ensureOpenStorsSchema(db);
		const { startDate, endDate } = getUtcRangeByDateDDMMYYYY(dateDDMMYYYY);

		const record = await db
			.prepare(
				`SELECT * 
				 FROM openStors 
				 WHERE userId = ? 
				   AND shopUuid = ?
				   AND date BETWEEN ? AND ?
				 ORDER BY date DESC
				 LIMIT 1`,
			)
			.bind(userId, shopUuid, startDate, endDate)
			.first<{
				date: string;
				cash?: number;
				sign?: number;
				ok?: number;
			}>();

		if (!record) {
			return { exists: false };
		}

		const countByCategory = async (prefix: string) => {
			let cursor: string | undefined;
			const set = new Set<string>();
			do {
				const listed = await r2.list({ prefix, cursor });
				for (const obj of listed.objects) {
					const key = obj.key;
					const rel = key.slice(prefix.length);
					if (!rel) continue;
					const category = rel.split("/")[0];
					if (["area", "stock", "cash", "mrc"].includes(category)) {
						set.add(key);
					}
				}
				cursor = listed.truncated ? listed.cursor : undefined;
			} while (cursor);

			let area = 0;
			let stock = 0;
			let cash = 0;
			let mrc = 0;
			for (const key of set) {
				if (key.includes("/area/")) area += 1;
				if (key.includes("/stock/")) stock += 1;
				if (key.includes("/cash/")) cash += 1;
				if (key.includes("/mrc/")) mrc += 1;
			}
			return { area, stock, cash, mrc };
		};

		let counts = { area: 0, stock: 0, cash: 0, mrc: 0 };
		const newPrefix = `evotor/opening/${dateDDMMYYYY}/${shopUuid}/${userId}/`;
		counts = await countByCategory(newPrefix);
		if (counts.area + counts.stock + counts.cash + counts.mrc === 0) {
			const legacyPrefix = `opening/${dateDDMMYYYY}/${shopUuid}/${userId}/`;
			counts = await countByCategory(legacyPrefix);
		}

		const photoCount =
			Math.min(counts.area, 2) +
			Math.min(counts.stock, 3) +
			Math.min(counts.cash, 1) +
			Math.min(counts.mrc, 1);

		const hasCashCheck =
			record.cash != null || record.sign != null || record.ok != null;

		const totalSteps = 7 + 3;
		let completedSteps = photoCount;
		if (record.cash != null) completedSteps++;
		if (record.sign != null) completedSteps++;
		if (record.ok != null) completedSteps++;

		return {
			exists: true,
			openTime: record.date,
			hasPhotos: photoCount > 0,
			photoCount,
			hasCashCheck,
			completionPercent: Math.round((completedSteps / totalSteps) * 100),
		};
	} catch (err) {
		console.error("Ошибка при получении деталей открытия:", err);
		return null;
	}
}

export interface OpenStoreReportRow {
	shopUuid: string;
	userId: string;
	openedByName: string | null;
	date: string;
	cash: number | null;
	sign: string | null;
	ok: number | null;
}

export async function getOpenStoreRowsByPeriod(
	db: D1Database,
	sinceIso: string,
	untilIso: string,
): Promise<OpenStoreReportRow[]> {
	try {
		await ensureOpenStorsSchema(db);
		const result = await db
			.prepare(
				`SELECT shopUuid, userId, openedByName, date, cash, sign, ok
				FROM openStors
				WHERE shopUuid IS NOT NULL
					AND date >= ?
					AND date <= ?
				ORDER BY date DESC`,
			)
			.bind(sinceIso, untilIso)
			.all<OpenStoreReportRow>();

		return (result.results ?? []) as OpenStoreReportRow[];
	} catch (err) {
		console.error("Ошибка при получении openStors за период:", err);
		return [];
	}
}
