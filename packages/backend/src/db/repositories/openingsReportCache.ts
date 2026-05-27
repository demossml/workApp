import type { AppDB } from "../../db-duckdb.js";

let schemaEnsured = false;

const ensureSchema = async (db: AppDB) => {
	if (schemaEnsured) return;

	await db
		.prepare(
			"CREATE TABLE IF NOT EXISTS openingsReportCache (" +
				"id INTEGER PRIMARY KEY AUTOINCREMENT, " +
				"startDate TEXT NOT NULL, " +
				"endDate TEXT NOT NULL, " +
				"payloadJson TEXT NOT NULL, " +
				"updatedAt TEXT NOT NULL, " +
				"UNIQUE(startDate, endDate)" +
				");",
		)
		.run();

	schemaEnsured = true;
};

export const getOpeningsReportCache = async (
	db: AppDB,
	startDate: string,
	endDate: string,
): Promise<{ payload: unknown; updatedAt: string } | null> => {
	await ensureSchema(db);

	const row = await db
		.prepare(
			`SELECT payloadJson, updatedAt
			 FROM openingsReportCache
			 WHERE startDate = ? AND endDate = ?
			 LIMIT 1`,
		)
		.bind(startDate, endDate)
		.first<{ payloadJson: string; updatedAt: string }>();

	if (!row) return null;

	return {
		payload: JSON.parse(row.payloadJson || "{}"),
		updatedAt: row.updatedAt,
	};
};

export const saveOpeningsReportCache = async (
	db: AppDB,
	startDate: string,
	endDate: string,
	payload: unknown,
) => {
	await ensureSchema(db);
	const updatedAt = new Date().toISOString();

	await db
		.prepare(
			`INSERT INTO openingsReportCache (startDate, endDate, payloadJson, updatedAt)
			 VALUES (?, ?, ?, ?)
			 ON CONFLICT(startDate, endDate) DO UPDATE SET
				payloadJson = excluded.payloadJson,
				updatedAt = excluded.updatedAt`,
		)
		.bind(startDate, endDate, JSON.stringify(payload), updatedAt)
		.run();
};
