import type { D1Database } from "@cloudflare/workers-types";

export async function createOpenStorsTable(db: D1Database): Promise<void> {
	try {
		const createTableQuery =
			"CREATE TABLE IF NOT EXISTS openStors (" +
			"id INTEGER PRIMARY KEY AUTOINCREMENT, " +
			"date TEXT NOT NULL, " +
			"userId TEXT NOT NULL, " +
			"cash REAL, " +
			"sign TEXT CHECK(sign IN ('+', '-')), " +
			"ok INTEGER" +
			");";
		await db.prepare(createTableQuery).run();
	} catch (err) {
		console.error("Ошибка при создании таблицы:", err);
	}
}

export async function updateOpenStore(
	db: D1Database,
	userId: string,
	data: { cash: number | null; sign: string | null },
): Promise<void> {
	try {
		await db
			.prepare(
				"UPDATE openStors " +
					"SET cash = ?, sign = ? " +
					"WHERE userId = ? " +
					"ORDER BY id DESC " +
					"LIMIT 1",
			)
			.bind(data.cash, data.sign, userId)
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
		cash?: number | null;
		sign?: string | null;
		ok?: number | null;
	},
): Promise<void> {
	try {
		await db
			.prepare(
				"INSERT INTO openStors (date, userId, cash, sign, ok) VALUES (?, ?, ?, ?, ?)",
			)
			.bind(
				data.date,
				data.userId,
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
	dateDDMMYYYY: string,
): Promise<boolean> {
	try {
		const [day, month, year] = dateDDMMYYYY.split("-").map(Number);

		const startDate = new Date(
			Date.UTC(year, month - 1, day, 0, 0, 0),
		).toISOString();
		const endDate = new Date(
			Date.UTC(year, month - 1, day, 23, 59, 59),
		).toISOString();

		const res = await db
			.prepare(
				`SELECT COUNT(*) AS count 
				 FROM openStors 
				 WHERE userId = ? 
				   AND date BETWEEN ? AND ? 
				   AND (cash IS NOT NULL OR sign IS NOT NULL OR ok IS NOT NULL)`,
			)
			.bind(userId, startDate, endDate)
			.first<{ count: number }>();

		const count = res?.count ?? 0;

		return count > 0;
	} catch (err) {
		console.error("Ошибка при проверке открытия магазина:", err);
		return false;
	}
}

export async function getOpenStoreDetails(
	db: D1Database,
	userId: string,
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
		const [day, month, year] = dateDDMMYYYY.split("-").map(Number);

		const startDate = new Date(
			Date.UTC(year, month - 1, day, 0, 0, 0),
		).toISOString();
		const endDate = new Date(
			Date.UTC(year, month - 1, day, 23, 59, 59),
		).toISOString();

		const record = await db
			.prepare(
				`SELECT * 
				 FROM openStors 
				 WHERE userId = ? 
				   AND date BETWEEN ? AND ?
				 ORDER BY date DESC
				 LIMIT 1`,
			)
			.bind(userId, startDate, endDate)
			.first<{
				date: string;
				cash?: number;
				sign?: number;
				ok?: number;
			}>();

		if (!record) {
			return { exists: false };
		}

		const photoQuery = await db
			.prepare(
				`SELECT 
					photoCashRegisterPhoto,
					photoСabinetsPhoto,
					photoShowcasePhoto1,
					photoShowcasePhoto2,
					photoShowcasePhoto3,
					photoMRCPhoto1,
					photoMRCPhoto2
				FROM openShops
				WHERE userId = ? AND date LIKE ?`,
			)
			.bind(userId, `${dateDDMMYYYY}%`)
			.first<Record<string, string | null>>();

		let photoCount = 0;
		if (photoQuery) {
			const photos = Object.values(photoQuery);
			photoCount = photos.filter((p) => p !== null && p !== "").length;
		}

		const hasCashCheck =
			record.cash !== null || record.sign !== null || record.ok !== null;

		const totalSteps = 7 + 3;
		let completedSteps = photoCount;
		if (record.cash !== null) completedSteps++;
		if (record.sign !== null) completedSteps++;
		if (record.ok !== null) completedSteps++;

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
