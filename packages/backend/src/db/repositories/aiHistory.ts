import type { D1Database } from "@cloudflare/workers-types";

let schemaEnsured = false;

async function ensureAiHistorySchema(db: D1Database): Promise<void> {
	if (schemaEnsured) return;

	await db
		.prepare(
			"CREATE TABLE IF NOT EXISTS ai_shift_summaries (" +
				"id INTEGER PRIMARY KEY AUTOINCREMENT, " +
				"shop_uuid TEXT NOT NULL, " +
				"date TEXT NOT NULL, " +
				"generated_at TEXT NOT NULL DEFAULT (datetime('now')), " +
				"summary_text TEXT NOT NULL, " +
				"revenue_actual REAL, " +
				"revenue_plan REAL, " +
				"top_employee TEXT, " +
				"anomalies TEXT, " +
				"recommendations TEXT" +
				")",
		)
		.run();

	await db
		.prepare(
			"CREATE TABLE IF NOT EXISTS ai_alerts (" +
				"id INTEGER PRIMARY KEY AUTOINCREMENT, " +
				"shop_uuid TEXT NOT NULL, " +
				"alert_type TEXT NOT NULL, " +
				"severity TEXT NOT NULL, " +
				"triggered_at TEXT NOT NULL DEFAULT (datetime('now')), " +
				"message TEXT NOT NULL, " +
				"acknowledged_at TEXT, " +
				"acknowledged_by TEXT" +
				")",
		)
		.run();

	await db
		.prepare(
			"CREATE INDEX IF NOT EXISTS idx_ai_shift_summaries_shop_date ON ai_shift_summaries (shop_uuid, date)",
		)
		.run();
	await db
		.prepare(
			"CREATE INDEX IF NOT EXISTS idx_ai_alerts_shop_triggered ON ai_alerts (shop_uuid, triggered_at)",
		)
		.run();

	schemaEnsured = true;
}

export async function saveAiShiftSummary(
	db: D1Database,
	input: {
		shopUuid: string;
		date: string;
		summaryText: string;
		revenueActual?: number | null;
		revenuePlan?: number | null;
		topEmployee?: string | null;
		anomalies?: string[] | null;
		recommendations?: string[] | null;
	},
) {
	await ensureAiHistorySchema(db);
	await db
		.prepare(
			`INSERT INTO ai_shift_summaries (
        shop_uuid, date, generated_at, summary_text, revenue_actual, revenue_plan, top_employee, anomalies, recommendations
      ) VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			input.shopUuid,
			input.date,
			input.summaryText,
			input.revenueActual ?? null,
			input.revenuePlan ?? null,
			input.topEmployee ?? null,
			input.anomalies ? JSON.stringify(input.anomalies) : null,
			input.recommendations ? JSON.stringify(input.recommendations) : null,
		)
		.run();
}

export async function saveAiAlert(
	db: D1Database,
	input: {
		shopUuid: string;
		alertType: "tempo_alert" | "anomaly" | "dead_stock";
		severity: "info" | "warning" | "critical";
		message: string;
	},
) {
	await ensureAiHistorySchema(db);
	await db
		.prepare(
			`INSERT INTO ai_alerts (
        shop_uuid, alert_type, severity, triggered_at, message
      ) VALUES (?, ?, ?, datetime('now'), ?)`,
		)
		.bind(input.shopUuid, input.alertType, input.severity, input.message)
		.run();
}

export async function listAiShiftSummaries(
	db: D1Database,
	input?: {
		shopUuid?: string;
		date?: string;
		limit?: number;
	},
) {
	await ensureAiHistorySchema(db);
	const whereParts: string[] = [];
	const bindValues: unknown[] = [];

	if (input?.shopUuid) {
		whereParts.push("shop_uuid = ?");
		bindValues.push(input.shopUuid);
	}
	if (input?.date) {
		whereParts.push("date = ?");
		bindValues.push(input.date);
	}

	const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
	const limit = Math.min(Math.max(Math.trunc(input?.limit ?? 30), 1), 200);

	const query = `
    SELECT
      id,
      shop_uuid AS shopUuid,
      date,
      generated_at AS generatedAt,
      summary_text AS summaryText,
      revenue_actual AS revenueActual,
      revenue_plan AS revenuePlan,
      top_employee AS topEmployee,
      anomalies,
      recommendations
    FROM ai_shift_summaries
    ${whereSql}
    ORDER BY generated_at DESC
    LIMIT ?
  `;

	const result = await db
		.prepare(query)
		.bind(...bindValues, limit)
		.all<{
			id: number;
			shopUuid: string;
			date: string;
			generatedAt: string;
			summaryText: string;
			revenueActual: number | null;
			revenuePlan: number | null;
			topEmployee: string | null;
			anomalies: string | null;
			recommendations: string | null;
		}>();

	return (result.results || []).map((row) => ({
		...row,
		anomalies: row.anomalies ? (JSON.parse(row.anomalies) as string[]) : [],
		recommendations: row.recommendations
			? (JSON.parse(row.recommendations) as string[])
			: [],
	}));
}

export async function listAiAlerts(
	db: D1Database,
	input?: {
		shopUuid?: string;
		alertType?: "tempo_alert" | "anomaly" | "dead_stock";
		limit?: number;
	},
) {
	await ensureAiHistorySchema(db);
	const whereParts: string[] = [];
	const bindValues: unknown[] = [];

	if (input?.shopUuid) {
		whereParts.push("shop_uuid = ?");
		bindValues.push(input.shopUuid);
	}
	if (input?.alertType) {
		whereParts.push("alert_type = ?");
		bindValues.push(input.alertType);
	}

	const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
	const limit = Math.min(Math.max(Math.trunc(input?.limit ?? 50), 1), 200);

	const query = `
    SELECT
      id,
      shop_uuid AS shopUuid,
      alert_type AS alertType,
      severity,
      triggered_at AS triggeredAt,
      message,
      acknowledged_at AS acknowledgedAt,
      acknowledged_by AS acknowledgedBy
    FROM ai_alerts
    ${whereSql}
    ORDER BY triggered_at DESC
    LIMIT ?
  `;

	const result = await db
		.prepare(query)
		.bind(...bindValues, limit)
		.all<{
			id: number;
			shopUuid: string;
			alertType: "tempo_alert" | "anomaly" | "dead_stock";
			severity: "info" | "warning" | "critical";
			triggeredAt: string;
			message: string;
			acknowledgedAt: string | null;
			acknowledgedBy: string | null;
		}>();

	return result.results || [];
}
