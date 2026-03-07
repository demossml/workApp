import type { D1Database } from "@cloudflare/workers-types";

let schemaEnsured = false;

const ensureSchema = async (db: D1Database) => {
	if (schemaEnsured) return;

	await db
		.prepare(
			"CREATE TABLE IF NOT EXISTS profitReportSnapshots (" +
				"id INTEGER PRIMARY KEY AUTOINCREMENT, " +
				"createdAt TEXT NOT NULL, " +
				"createdBy TEXT, " +
				"since TEXT NOT NULL, " +
				"until TEXT NOT NULL, " +
				"payloadJson TEXT NOT NULL" +
				");",
		)
		.run();

	schemaEnsured = true;
};

export interface ProfitReportSnapshotPayload {
	period: { since: string; until: string };
	report: Record<
		string,
		{
			byCategory: Record<string, number>;
			totalEvoExpenses: number;
			expenses1C: number;
			grossProfit: number;
			netProfit: number;
		}
	>;
}

export const saveProfitReportSnapshot = async (
	db: D1Database,
	input: {
		createdBy: string | null;
		since: string;
		until: string;
		payload: ProfitReportSnapshotPayload;
	},
) => {
	await ensureSchema(db);
	const createdAt = new Date().toISOString();

	const result = await db
		.prepare(
			`INSERT INTO profitReportSnapshots (createdAt, createdBy, since, until, payloadJson)
			 VALUES (?, ?, ?, ?, ?)`,
		)
		.bind(
			createdAt,
			input.createdBy,
			input.since,
			input.until,
			JSON.stringify(input.payload),
		)
		.run();

	return {
		id: Number(result.meta.last_row_id),
		createdAt,
	};
};

export const listProfitReportSnapshots = async (
	db: D1Database,
	limit = 20,
) => {
	await ensureSchema(db);

	const rows = await db
		.prepare(
			`SELECT id, createdAt, createdBy, since, until
			 FROM profitReportSnapshots
			 ORDER BY id DESC
			 LIMIT ?`,
		)
		.bind(Math.max(1, Math.min(limit, 100)))
		.all<{
			id: number;
			createdAt: string;
			createdBy: string | null;
			since: string;
			until: string;
		}>();

	return rows.results || [];
};

export const getProfitReportSnapshotById = async (
	db: D1Database,
	id: number,
): Promise<
	| {
			id: number;
			createdAt: string;
			createdBy: string | null;
			since: string;
			until: string;
			payload: ProfitReportSnapshotPayload;
	  }
	| null
> => {
	await ensureSchema(db);

	const row = await db
		.prepare(
			`SELECT id, createdAt, createdBy, since, until, payloadJson
			 FROM profitReportSnapshots
			 WHERE id = ?
			 LIMIT 1`,
		)
		.bind(id)
		.first<{
			id: number;
			createdAt: string;
			createdBy: string | null;
			since: string;
			until: string;
			payloadJson: string;
		}>();

	if (!row) return null;

	return {
		id: row.id,
		createdAt: row.createdAt,
		createdBy: row.createdBy,
		since: row.since,
		until: row.until,
		payload: JSON.parse(row.payloadJson || "{}") as ProfitReportSnapshotPayload,
	};
};
