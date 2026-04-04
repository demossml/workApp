import { Hono } from "hono";
import type { IEnv } from "../types";
import type { Context } from "hono";
import { validate } from "../validation";
import { trackAppEvent } from "../analytics/track";
import { AnalyticsEventSchema } from "../validation";
import { formatDate, formatDateWithTime } from "../utils";
import { getMonitoringSnapshot } from "../monitoring";
import { getPlan } from "../db/repositories/plan";
import { getApiLatencyValuesByPeriod } from "../db/repositories/metricsMinute";
import { logger } from "../logger";
import type { D1Database } from "@cloudflare/workers-types";
import { aggregateShopFinancialFromDocuments } from "../contracts/financialAggregation";
import { getData as getOpeningByDateAndShop } from "../db/repositories/openShops";
import { getAllUuid as getAccessoryGroupUuids } from "../db/repositories/accessories";
import { getProductsByGroup } from "../db/repositories/products";
import { getDocumentsFromIndexFirst } from "../services/indexDocumentsFallback";

function percentile(values: number[], p: number) {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const idx = Math.ceil((p / 100) * sorted.length) - 1;
	return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function formatDateYYYYMMDD(date: Date) {
	const y = date.getUTCFullYear();
	const m = String(date.getUTCMonth() + 1).padStart(2, "0");
	const d = String(date.getUTCDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

function toMskDateKey(date: Date): string {
	const shifted = new Date(date.getTime() + 3 * 60 * 60 * 1000);
	return formatDateYYYYMMDD(shifted);
}

function toMskDDMMYYYY(date: Date): string {
	const mskKey = toMskDateKey(date); // YYYY-MM-DD
	const [yyyy, mm, dd] = mskKey.split("-");
	return `${dd}-${mm}-${yyyy}`;
}

function parseMskHourFromIso(iso: string | null | undefined): number | null {
	if (!iso) return null;
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return null;
	const shifted = new Date(date.getTime() + 3 * 60 * 60 * 1000);
	const hour = shifted.getUTCHours();
	return Number.isFinite(hour) ? hour : null;
}

async function resolveOpenHourFromOpenings(
	db: D1Database,
	targetDate: Date,
	shopUuids: string[],
): Promise<number | null> {
	if (shopUuids.length === 0) return null;
	const openingDate = toMskDDMMYYYY(targetDate);
	const openings = await Promise.all(
		shopUuids.map((shopUuid) => getOpeningByDateAndShop(openingDate, shopUuid, db)),
	);
	const hours = openings
		.map((row) => parseMskHourFromIso(row?.dateTime))
		.filter((hour): hour is number => hour !== null);
	if (hours.length === 0) return null;
	return Math.min(...hours);
}

function computeNetFromDocuments(
	docs: Array<{ type: string; transactions?: Array<{ type?: string; sum?: number }> }>,
): number {
	let net = 0;
	for (const doc of docs) {
		if (!["SELL", "PAYBACK"].includes(doc.type)) continue;
		for (const tx of doc.transactions || []) {
			if (tx.type !== "PAYMENT") continue;
			const raw = Number(tx.sum || 0);
			if (!Number.isFinite(raw) || raw === 0) continue;
			if (doc.type === "PAYBACK") {
				net -= Math.abs(raw);
			} else {
				net += raw;
			}
		}
	}
	return net;
}

function trimmedMean(values: number[], trimRatio = 0.1): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const trim = Math.floor(sorted.length * trimRatio);
	const start = Math.min(trim, sorted.length - 1);
	const end = Math.max(start + 1, sorted.length - trim);
	const slice = sorted.slice(start, end);
	if (slice.length === 0) return sorted.reduce((s, x) => s + x, 0) / sorted.length;
	return slice.reduce((s, x) => s + x, 0) / slice.length;
}

async function computeAutoTotalSalesPlan(
	db: D1Database,
	evo: IEnv["Variables"]["evotor"],
	targetDate: Date,
	options?: {
		historyDays?: number;
		growthBiasPct?: number;
		shopUuidsFilter?: string[];
	},
) {
	const historyDaysRaw = Number(options?.historyDays ?? 28);
	const historyDays = Number.isFinite(historyDaysRaw)
		? Math.min(Math.max(Math.round(historyDaysRaw), 7), 120)
		: 28;
	const growthBiasPctRaw = Number(options?.growthBiasPct ?? 5);
	const growthBiasPct = Number.isFinite(growthBiasPctRaw)
		? Math.min(Math.max(growthBiasPctRaw, -20), 20)
		: 5;

	const historyStart = new Date(targetDate);
	historyStart.setUTCDate(historyStart.getUTCDate() - historyDays);
	const historyEnd = new Date(targetDate);
	historyEnd.setUTCDate(historyEnd.getUTCDate() - 1);

	const since = formatDateWithTime(historyStart, false);
	const until = formatDateWithTime(historyEnd, true);
	const shopUuids =
		options?.shopUuidsFilter && options.shopUuidsFilter.length > 0
			? options.shopUuidsFilter
			: await evo.getShopUuids();
	const docsByShop = await Promise.all(
		shopUuids.map((shopUuid) =>
			getDocumentsFromIndexFirst(db, evo, shopUuid, since, until, {
				types: ["SELL", "PAYBACK"],
			}),
		),
	);
	const docs = docsByShop.flat();

	const dailyNetMap = new Map<string, number>();
	for (const doc of docs) {
		if (!["SELL", "PAYBACK"].includes(doc.type)) continue;
		const closeDate = new Date(doc.closeDate);
		if (Number.isNaN(closeDate.getTime())) continue;
		const dateKey = toMskDateKey(closeDate);
		const current = dailyNetMap.get(dateKey) || 0;
		const delta = computeNetFromDocuments([doc]);
		dailyNetMap.set(dateKey, current + delta);
	}

	const dailyRows = Array.from(dailyNetMap.entries())
		.map(([date, net]) => ({ date, net }))
		.sort((a, b) => a.date.localeCompare(b.date));
	const allValues = dailyRows.map((row) => row.net).filter((x) => Number.isFinite(x));

	const targetWeekday = (targetDate.getUTCDay() + 6) % 7;
	const sameWeekdayValues = dailyRows
		.filter((row) => {
			const d = new Date(`${row.date}T00:00:00Z`);
			const weekday = (d.getUTCDay() + 6) % 7;
			return weekday === targetWeekday;
		})
		.map((row) => row.net);

	const baseSample = sameWeekdayValues.length >= 3 ? sameWeekdayValues : allValues;
	const base = trimmedMean(baseSample, 0.12);

	const last7 = allValues.slice(-7);
	const prev7 = allValues.slice(-14, -7);
	const last7Avg =
		last7.length > 0 ? last7.reduce((sum, x) => sum + x, 0) / last7.length : base;
	const prev7Avg =
		prev7.length > 0 ? prev7.reduce((sum, x) => sum + x, 0) / prev7.length : last7Avg;
	const trendFactorRaw = prev7Avg > 0 ? last7Avg / prev7Avg : 1;
	const trendFactor = Math.min(1.15, Math.max(0.85, trendFactorRaw));
	const biasFactor = 1 + growthBiasPct / 100;

	const autoPlan = Math.max(0, Math.round(base * trendFactor * biasFactor));

	return {
		autoPlan,
		meta: {
			historyDays,
			growthBiasPct,
			samples: allValues.length,
			sameWeekdaySamples: sameWeekdayValues.length,
			base,
			last7Avg,
			prev7Avg,
			trendFactor,
			biasFactor,
		},
	};
}

async function computeHourlyPlanWeights(
	db: D1Database,
	evo: IEnv["Variables"]["evotor"],
	targetDate: Date,
	options: {
		openHour: number;
		closeHour: number;
		historyDays?: number;
		shopUuidsFilter?: string[];
	},
) {
	const historyDaysRaw = Number(options.historyDays ?? 28);
	const historyDays = Number.isFinite(historyDaysRaw)
		? Math.min(Math.max(Math.round(historyDaysRaw), 7), 120)
		: 28;
	const openHour = options.openHour;
	const closeHour = options.closeHour;

	const historyStart = new Date(targetDate);
	historyStart.setUTCDate(historyStart.getUTCDate() - historyDays);
	const historyEnd = new Date(targetDate);
	historyEnd.setUTCDate(historyEnd.getUTCDate() - 1);

	const since = formatDateWithTime(historyStart, false);
	const until = formatDateWithTime(historyEnd, true);
	const shopUuids =
		options.shopUuidsFilter && options.shopUuidsFilter.length > 0
			? options.shopUuidsFilter
			: await evo.getShopUuids();
	const docsByShop = await Promise.all(
		shopUuids.map((shopUuid) =>
			getDocumentsFromIndexFirst(db, evo, shopUuid, since, until, {
				types: ["SELL", "PAYBACK"],
			}),
		),
	);
	const docs = docsByShop.flat();

	const hours = Array.from({ length: closeHour - openHour + 1 }, (_, i) => i + openHour);
	const hourNet = new Map<number, number>(hours.map((h) => [h, 0]));

	for (const doc of docs) {
		if (!["SELL", "PAYBACK"].includes(doc.type)) continue;
		const closeDate = new Date(doc.closeDate);
		if (Number.isNaN(closeDate.getTime())) continue;
		closeDate.setHours(closeDate.getHours() + 3);
		const hour = closeDate.getHours();
		if (!hourNet.has(hour)) continue;
		const delta = computeNetFromDocuments([doc]);
		hourNet.set(hour, (hourNet.get(hour) || 0) + delta);
	}

	const positiveHourValues = hours.map((hour) => Math.max(0, hourNet.get(hour) || 0));
	const positiveTotal = positiveHourValues.reduce((sum, value) => sum + value, 0);

	const weights = new Map<number, number>();
	if (positiveTotal > 0) {
		hours.forEach((hour, idx) => {
			weights.set(hour, positiveHourValues[idx] / positiveTotal);
		});
	} else {
		const uniform = hours.length > 0 ? 1 / hours.length : 0;
		hours.forEach((hour) => weights.set(hour, uniform));
	}

	return {
		weights,
		meta: {
			historyDays,
			samples: docs.length,
			positiveTotal,
		},
	};
}

function dayNumToDateString(dayNum: number) {
	return formatDateYYYYMMDD(new Date(dayNum * 24 * 60 * 60 * 1000));
}

let analyticsSchemaEnsured = false;

async function ensureAnalyticsSchema(db: D1Database) {
	if (analyticsSchemaEnsured) return;
	await db
		.prepare(
			`CREATE TABLE IF NOT EXISTS app_events (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				ts INTEGER NOT NULL,
				event_name TEXT NOT NULL,
				user_id TEXT,
				shop_uuid TEXT,
				role TEXT,
				screen TEXT,
				trace_id TEXT,
				props_json TEXT,
				app_version TEXT
			);`,
		)
		.run();
	await db
		.prepare(
			`CREATE TABLE IF NOT EXISTS metrics_minute (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				minute_ts INTEGER NOT NULL,
				metric_key TEXT NOT NULL,
				shop_uuid TEXT,
				value REAL NOT NULL
			);`,
		)
		.run();
	analyticsSchemaEnsured = true;
}

function getSinceUntilFromQuery(c: Context<IEnv>) {
	const today = new Date();
	const defaultDate = formatDateYYYYMMDD(today);
	const sinceDate = c.req.query("since") || defaultDate;
	const untilDate = c.req.query("until") || sinceDate;
	return { sinceDate, untilDate };
}

function safePctDiff(actual: number, baseline: number): number {
	const denominator = Math.abs(baseline);
	if (denominator === 0) {
		return actual === 0 ? 0 : 100;
	}
	return (Math.abs(actual - baseline) / denominator) * 100;
}

export const analyticsRoutes = new Hono<IEnv>()
	.post("/event", async (c) => {
		const payload = validate(
			AnalyticsEventSchema,
			await c.req.json().catch(() => ({})),
		);

		await trackAppEvent(c, payload.eventName, {
			shopUuid: payload.shopUuid,
			role: payload.role,
			screen: payload.screen,
			traceId: payload.traceId,
			props: payload.props ?? undefined,
			appVersion: payload.appVersion,
			userId: payload.userId,
		});

		return c.json({ success: true });
	})
	.get("/dashboards/product", async (c) => {
		try {
			await ensureAnalyticsSchema(c.env.DB);
			const now = Date.now();
			const oneDayMs = 24 * 60 * 60 * 1000;
			const sevenDaysMs = 7 * oneDayMs;
			const retentionWindows = [1, 7, 14, 30] as const;
			const requestedDays = Number(c.req.query("days") || 28);
			const analysisDays = Number.isFinite(requestedDays)
				? Math.min(Math.max(Math.round(requestedDays), 7), 120)
				: 28;

			const dayStart = now - oneDayMs;
			const weekStart = now - sevenDaysMs;
			const sinceTs = now - analysisDays * oneDayMs;
			const horizonTs = now + 30 * oneDayMs;

			const dauRow = await c.env.DB
				.prepare(
					"SELECT COUNT(DISTINCT user_id) as value FROM app_events WHERE user_id IS NOT NULL AND user_id != '' AND ts >= ?",
				)
				.bind(dayStart)
				.first<{ value: number }>();

			const wauRow = await c.env.DB
				.prepare(
					"SELECT COUNT(DISTINCT user_id) as value FROM app_events WHERE user_id IS NOT NULL AND user_id != '' AND ts >= ?",
				)
				.bind(weekStart)
				.first<{ value: number }>();

			const reportUsersRow = await c.env.DB
				.prepare(
					"SELECT COUNT(DISTINCT user_id) as value FROM app_events WHERE event_name = 'report_run_success' AND user_id IS NOT NULL AND user_id != '' AND ts >= ?",
				)
				.bind(weekStart)
				.first<{ value: number }>();

			const firstReportRow = await c.env.DB
				.prepare(
					`
					WITH first_open AS (
						SELECT user_id, MIN(ts) AS first_open_ts
						FROM app_events
						WHERE event_name = 'screen_open'
							AND user_id IS NOT NULL
							AND user_id != ''
							AND ts >= ?
						GROUP BY user_id
					),
					first_report AS (
						SELECT user_id, MIN(ts) AS first_report_ts
						FROM app_events
						WHERE event_name = 'report_run_success'
							AND user_id IS NOT NULL
							AND user_id != ''
							AND ts >= ?
						GROUP BY user_id
					)
					SELECT
						AVG(first_report.first_report_ts - first_open.first_open_ts) AS avg_ms,
						COUNT(*) AS users
					FROM first_open
					JOIN first_report ON first_open.user_id = first_report.user_id
					WHERE first_report.first_report_ts >= first_open.first_open_ts
				`,
				)
				.bind(weekStart, weekStart)
				.first<{ avg_ms: number | null; users: number }>();

			const timeToFirstRows = await c.env.DB
				.prepare(
					`
					WITH first_auth AS (
						SELECT user_id, MIN(ts) AS first_auth_ts
						FROM app_events
						WHERE user_id IS NOT NULL
							AND user_id != ''
							AND event_name IN ('auth_guest_login', 'auth_webapp_verified')
							AND ts >= ?
						GROUP BY user_id
					),
					first_report AS (
						SELECT user_id, MIN(ts) AS first_report_ts
						FROM app_events
						WHERE user_id IS NOT NULL
							AND user_id != ''
							AND event_name = 'report_run_success'
							AND ts >= ?
						GROUP BY user_id
					)
					SELECT
						(first_report.first_report_ts - first_auth.first_auth_ts) AS delta_ms
					FROM first_auth
					JOIN first_report ON first_auth.user_id = first_report.user_id
					WHERE first_report.first_report_ts >= first_auth.first_auth_ts
				`,
				)
				.bind(sinceTs, sinceTs)
				.all<{ delta_ms: number }>();

			const ttfMsValues = (timeToFirstRows.results || [])
				.map((row) => Number(row.delta_ms || 0))
				.filter((value) => Number.isFinite(value) && value >= 0);
			const ttfP50Ms = percentile(ttfMsValues, 50);
			const ttfP95Ms = percentile(ttfMsValues, 95);
			const ttfAvgMs =
				ttfMsValues.length > 0
					? ttfMsValues.reduce((acc, val) => acc + val, 0) / ttfMsValues.length
					: 0;

			const conversionByRoleRows = await c.env.DB
				.prepare(
					`
					WITH started AS (
						SELECT
							COALESCE(NULLIF(role, ''), 'unknown') AS role,
							COUNT(DISTINCT user_id) AS started_users
						FROM app_events
						WHERE event_name = 'report_run_started'
							AND user_id IS NOT NULL
							AND user_id != ''
							AND ts >= ?
						GROUP BY COALESCE(NULLIF(role, ''), 'unknown')
					),
					success AS (
						SELECT
							COALESCE(NULLIF(role, ''), 'unknown') AS role,
							COUNT(DISTINCT user_id) AS success_users
						FROM app_events
						WHERE event_name = 'report_run_success'
							AND user_id IS NOT NULL
							AND user_id != ''
							AND ts >= ?
						GROUP BY COALESCE(NULLIF(role, ''), 'unknown')
					)
					SELECT
						started.role AS role,
						started.started_users AS started_users,
						COALESCE(success.success_users, 0) AS success_users
					FROM started
					LEFT JOIN success ON success.role = started.role
					ORDER BY started_users DESC
				`,
				)
				.bind(sinceTs, sinceTs)
				.all<{ role: string; started_users: number; success_users: number }>();

			const conversionByShopRows = await c.env.DB
				.prepare(
					`
					WITH started AS (
						SELECT
							COALESCE(NULLIF(shop_uuid, ''), 'unknown') AS shop_uuid,
							COUNT(DISTINCT user_id) AS started_users
						FROM app_events
						WHERE event_name = 'report_run_started'
							AND user_id IS NOT NULL
							AND user_id != ''
							AND ts >= ?
						GROUP BY COALESCE(NULLIF(shop_uuid, ''), 'unknown')
					),
					success AS (
						SELECT
							COALESCE(NULLIF(shop_uuid, ''), 'unknown') AS shop_uuid,
							COUNT(DISTINCT user_id) AS success_users
						FROM app_events
						WHERE event_name = 'report_run_success'
							AND user_id IS NOT NULL
							AND user_id != ''
							AND ts >= ?
						GROUP BY COALESCE(NULLIF(shop_uuid, ''), 'unknown')
					)
					SELECT
						started.shop_uuid AS shop_uuid,
						started.started_users AS started_users,
						COALESCE(success.success_users, 0) AS success_users
					FROM started
					LEFT JOIN success ON success.shop_uuid = started.shop_uuid
					ORDER BY started_users DESC
					LIMIT 30
				`,
				)
				.bind(sinceTs, sinceTs)
				.all<{ shop_uuid: string; started_users: number; success_users: number }>();

			const firstSeenRows = await c.env.DB
				.prepare(
					`
					SELECT
						user_id,
						MIN(CAST(ts / 86400000 AS INTEGER)) AS cohort_day_num
					FROM app_events
					WHERE user_id IS NOT NULL
						AND user_id != ''
						AND ts >= ?
						AND ts <= ?
					GROUP BY user_id
				`,
				)
				.bind(sinceTs, now)
				.all<{ user_id: string; cohort_day_num: number }>();

			const activityRows = await c.env.DB
				.prepare(
					`
					SELECT
						user_id,
						CAST(ts / 86400000 AS INTEGER) AS day_num
					FROM app_events
					WHERE user_id IS NOT NULL
						AND user_id != ''
						AND ts >= ?
						AND ts <= ?
					GROUP BY user_id, day_num
				`,
				)
				.bind(sinceTs, horizonTs)
				.all<{ user_id: string; day_num: number }>();

			const userActivityDays = new Map<string, Set<number>>();
			for (const row of activityRows.results || []) {
				const uid = row.user_id;
				const dayNum = Number(row.day_num);
				if (!uid || !Number.isFinite(dayNum)) continue;
				if (!userActivityDays.has(uid)) {
					userActivityDays.set(uid, new Set<number>());
				}
				userActivityDays.get(uid)?.add(dayNum);
			}

			const cohortsByDay = new Map<number, string[]>();
			for (const row of firstSeenRows.results || []) {
				const uid = row.user_id;
				const cohortDay = Number(row.cohort_day_num);
				if (!uid || !Number.isFinite(cohortDay)) continue;
				if (!cohortsByDay.has(cohortDay)) cohortsByDay.set(cohortDay, []);
				cohortsByDay.get(cohortDay)?.push(uid);
			}

			const cohorts = Array.from(cohortsByDay.entries())
				.sort((a, b) => a[0] - b[0])
				.map(([cohortDay, users]) => {
					const totalUsers = users.length;
					const retained: Record<string, number> = {};
					for (const windowDay of retentionWindows) {
						let retainedCount = 0;
						for (const uid of users) {
							if (userActivityDays.get(uid)?.has(cohortDay + windowDay)) {
								retainedCount += 1;
							}
						}
						retained[`d${windowDay}`] =
							totalUsers > 0 ? retainedCount / totalUsers : 0;
					}

					return {
						cohortDate: dayNumToDateString(cohortDay),
						users: totalUsers,
						d1: retained.d1 || 0,
						d7: retained.d7 || 0,
						d14: retained.d14 || 0,
						d30: retained.d30 || 0,
					};
				});

			const weightedRetention = cohorts.reduce(
				(acc, cohort) => {
					acc.users += cohort.users;
					acc.d1 += cohort.d1 * cohort.users;
					acc.d7 += cohort.d7 * cohort.users;
					acc.d14 += cohort.d14 * cohort.users;
					acc.d30 += cohort.d30 * cohort.users;
					return acc;
				},
				{ users: 0, d1: 0, d7: 0, d14: 0, d30: 0 },
			);

			const dau = Number(dauRow?.value || 0);
			const wau = Number(wauRow?.value || 0);
			const reportUsers = Number(reportUsersRow?.value || 0);
			const conversionToReport = wau > 0 ? reportUsers / wau : 0;
			const avgTimeToFirstReportMs = Number(firstReportRow?.avg_ms || 0);

			const conversionByRole = (conversionByRoleRows.results || []).map((row) => {
				const startedUsers = Number(row.started_users || 0);
				const successUsers = Number(row.success_users || 0);
				return {
					role: row.role || "unknown",
					startedUsers,
					successUsers,
					conversion: startedUsers > 0 ? successUsers / startedUsers : 0,
				};
			});

			const conversionShopUuids = Array.from(
				new Set(
					(conversionByShopRows.results || [])
						.map((row) => row.shop_uuid)
						.filter((shopUuid) => !!shopUuid && shopUuid !== "unknown"),
				),
			);
			const conversionShopNamesMap =
				conversionShopUuids.length > 0
					? await c.var.evotor.getShopNamesByUuids(conversionShopUuids)
					: {};

			const conversionByShop = (conversionByShopRows.results || []).map((row) => {
				const startedUsers = Number(row.started_users || 0);
				const successUsers = Number(row.success_users || 0);
				const shopUuid = row.shop_uuid || "unknown";
				return {
					shopUuid,
					shopName: conversionShopNamesMap[shopUuid] || shopUuid,
					startedUsers,
					successUsers,
					conversion: startedUsers > 0 ? successUsers / startedUsers : 0,
				};
			});

			return c.json({
				period: {
					sinceTs,
					untilTs: now,
					analysisDays,
				},
				dau,
				wau,
				reportUsers,
				conversionToReport,
				avgTimeToFirstReportMs,
				avgTimeToFirstReportMinutes: Math.round(avgTimeToFirstReportMs / 60000),
				avgTimeToFirstReportUsers: Number(firstReportRow?.users || 0),
				timeToFirstReport: {
					samples: ttfMsValues.length,
					avgMs: ttfAvgMs,
					avgMinutes: Math.round(ttfAvgMs / 60000),
					p50Ms: ttfP50Ms,
					p95Ms: ttfP95Ms,
					p50Minutes: Math.round(ttfP50Ms / 60000),
					p95Minutes: Math.round(ttfP95Ms / 60000),
				},
				retention: {
					windows: retentionWindows,
					cohorts,
					weightedAverage:
						weightedRetention.users > 0
							? {
									d1: weightedRetention.d1 / weightedRetention.users,
									d7: weightedRetention.d7 / weightedRetention.users,
									d14: weightedRetention.d14 / weightedRetention.users,
									d30: weightedRetention.d30 / weightedRetention.users,
								}
							: {
									d1: 0,
									d7: 0,
									d14: 0,
									d30: 0,
								},
				},
				conversionByRole,
				conversionByShop,
			});
		} catch (error) {
			logger.error("Product dashboard failed", error);
			return c.json(
				{
					period: {
						sinceTs: 0,
						untilTs: 0,
						analysisDays: 28,
					},
					dau: 0,
					wau: 0,
					reportUsers: 0,
					conversionToReport: 0,
					avgTimeToFirstReportMs: 0,
					avgTimeToFirstReportMinutes: 0,
					avgTimeToFirstReportUsers: 0,
					timeToFirstReport: {
						samples: 0,
						avgMs: 0,
						avgMinutes: 0,
						p50Ms: 0,
						p95Ms: 0,
						p50Minutes: 0,
						p95Minutes: 0,
					},
					retention: {
						windows: [1, 7, 14, 30],
						cohorts: [],
						weightedAverage: {
							d1: 0,
							d7: 0,
							d14: 0,
							d30: 0,
						},
					},
					conversionByRole: [],
					conversionByShop: [],
				},
				200,
			);
		}
	})
	.get("/dashboards/reliability", async (c) => {
		try {
			await ensureAnalyticsSchema(c.env.DB);
			const snapshot = getMonitoringSnapshot();
			const { sinceDate, untilDate } = getSinceUntilFromQuery(c);
			const dayStart = new Date(`${sinceDate}T00:00:00Z`).getTime();
			const dayEnd = new Date(`${untilDate}T23:59:59Z`).getTime();

			const latencyRows = await getApiLatencyValuesByPeriod(
				c.get("drizzle"),
				dayStart,
				dayEnd,
			);
			const historicalLatencies = latencyRows.map((row) => Number(row.value || 0));
			const fallbackLatencies = snapshot.recent.map((x) => x.latencyMs);
			const latencySeries =
				historicalLatencies.length > 0 ? historicalLatencies : fallbackLatencies;
			const p50LatencyMs = percentile(latencySeries, 50);
			const p95LatencyMs = percentile(latencySeries, 95);

			const roleRows = await c.env.DB
			.prepare(
				`
					WITH role_totals AS (
						SELECT COALESCE(NULLIF(role, ''), 'unknown') AS role, COUNT(*) AS total
						FROM app_events
						WHERE ts >= ?
						GROUP BY COALESCE(NULLIF(role, ''), 'unknown')
					),
					role_errors AS (
						SELECT COALESCE(NULLIF(role, ''), 'unknown') AS role, COUNT(*) AS errors
						FROM app_events
						WHERE ts >= ?
							AND event_name = 'api_request_failed'
						GROUP BY COALESCE(NULLIF(role, ''), 'unknown')
					)
					SELECT
						role_totals.role AS role,
						role_totals.total AS total,
						COALESCE(role_errors.errors, 0) AS errors
					FROM role_totals
					LEFT JOIN role_errors ON role_errors.role = role_totals.role
					ORDER BY errors DESC, total DESC
					LIMIT 20
				`,
			)
			.bind(dayStart, dayStart)
			.all<{ role: string; total: number; errors: number }>();

			const endpointRoleRows = await c.env.DB
			.prepare(
				`
					SELECT
						COALESCE(json_extract(props_json, '$.endpoint'), 'unknown') AS endpoint,
						COALESCE(NULLIF(role, ''), 'unknown') AS role,
						COUNT(*) AS errors
					FROM app_events
					WHERE ts >= ?
						AND event_name = 'api_request_failed'
					GROUP BY endpoint, role
					ORDER BY errors DESC
					LIMIT 50
				`,
			)
			.bind(dayStart)
			.all<{ endpoint: string; role: string; errors: number }>();

			const errorCodesRows = await c.env.DB
			.prepare(
				`
					SELECT
						COALESCE(json_extract(props_json, '$.error_code'), 'UNKNOWN') AS code,
						COUNT(*) AS count
					FROM app_events
					WHERE ts >= ?
						AND event_name = 'api_request_failed'
					GROUP BY code
					ORDER BY count DESC
					LIMIT 10
				`,
			)
			.bind(dayStart)
			.all<{ code: string; count: number }>();

			return c.json({
				errorRateOverall: snapshot.errorRate,
				p50LatencyMs,
				p95LatencyMs,
				latencySource:
					historicalLatencies.length > 0 ? "metrics_minute" : "monitoring_recent",
				latencySamples: latencySeries.length,
				period: {
					since: sinceDate,
					until: untilDate,
				},
				byEndpoint: snapshot.endpoints
					.sort((a, b) => b.errorCount - a.errorCount)
					.slice(0, 20),
				byRole:
					roleRows.results?.map((row) => ({
						role: row.role,
						total: Number(row.total || 0),
						errors: Number(row.errors || 0),
						errorRate:
							Number(row.total || 0) > 0
								? Number(row.errors || 0) / Number(row.total || 0)
								: 0,
					})) || [],
				byEndpointRole:
					endpointRoleRows.results?.map((row) => ({
						endpoint: row.endpoint,
						role: row.role,
						errors: Number(row.errors || 0),
					})) || [],
				topErrorCodes:
					errorCodesRows.results?.map((row) => ({
						code: row.code,
						count: Number(row.count || 0),
					})) || [],
			});
		} catch (error) {
			logger.error("Reliability dashboard failed", error);
			const snapshot = getMonitoringSnapshot();
			return c.json({
				errorRateOverall: snapshot.errorRate,
				p50LatencyMs: 0,
				p95LatencyMs: 0,
				latencySource: "fallback_error",
				latencySamples: 0,
				period: getSinceUntilFromQuery(c),
				byEndpoint: snapshot.endpoints
					.sort((a, b) => b.errorCount - a.errorCount)
					.slice(0, 20),
				byRole: [],
				byEndpointRole: [],
				topErrorCodes: [],
			});
		}
	})
	.get("/dashboards/business", async (c) => {
		const { sinceDate, untilDate } = getSinceUntilFromQuery(c);
		const sinceIso = formatDateWithTime(new Date(sinceDate), false);
		const untilIso = formatDateWithTime(new Date(untilDate), true);
		const shopUuidFilter = c.req.query("shopUuid") || "";
		const shopNameFilter = c.req.query("shopName") || "";

		const evo = c.var.evotor;
		const allShopUuids = await evo.getShopUuids();
		const allShopNamesMap = await evo.getShopNamesByUuids(allShopUuids);
		const shopUuids = allShopUuids.filter((shopUuid) => {
			if (shopUuidFilter && shopUuid !== shopUuidFilter) return false;
			if (shopNameFilter && allShopNamesMap[shopUuid] !== shopNameFilter) return false;
			return true;
		});
		const shopNamesMap = allShopNamesMap;
		const todayIsoDate = formatDateYYYYMMDD(new Date());
		const todayPlanDate = formatDate(new Date());
		const isTodayRange =
			sinceDate === todayIsoDate && untilDate === todayIsoDate;
		const planByShop = isTodayRange
			? await getPlan(todayPlanDate, c.env.DB)
			: null;

		const stores = await Promise.all(
			shopUuids.map(async (shopUuid) => {
				const documents = await getDocumentsFromIndexFirst(
					c.get("db"),
					evo,
					shopUuid,
					sinceIso,
					untilIso,
					{ types: ["SELL", "PAYBACK"] },
				);
				let revenue = 0;
				let refunds = 0;
				let checks = 0;

				for (const doc of documents) {
					const isRefund = doc.type === "PAYBACK";
					checks += 1;
					for (const tx of doc.transactions || []) {
						if (tx.type !== "PAYMENT") continue;
						const amount = Math.abs(tx.sum || 0);
						if (isRefund) {
							refunds += amount;
						} else {
							revenue += amount;
						}
					}
				}

				const netSales = revenue - refunds;
				const avgCheck = checks > 0 ? netSales / checks : 0;
				const plan = planByShop?.[shopUuid] ?? null;
				const planFactPercent = plan && plan > 0 ? (revenue / plan) * 100 : null;

				return {
					shopUuid,
					shopName: shopNamesMap[shopUuid] || shopUuid,
					revenue,
					refunds,
					netSales,
					checks,
					avgCheck,
					plan,
					planFactPercent,
				};
			}),
		);

		const totals = stores.reduce(
			(acc, store) => {
				acc.revenue += store.revenue;
				acc.refunds += store.refunds;
				acc.netSales += store.netSales;
				acc.checks += store.checks;
				return acc;
			},
			{ revenue: 0, refunds: 0, netSales: 0, checks: 0 },
		);
		const avgCheck = totals.checks > 0 ? totals.netSales / totals.checks : 0;

		return c.json({
			period: {
				since: sinceDate,
				until: untilDate,
				isTodayRange,
			},
			shopFilter: shopUuidFilter || shopNameFilter || "all",
			totals: {
				...totals,
				avgCheck,
			},
			stores: stores.sort((a, b) => b.netSales - a.netSales),
		});
	})
	.get("/reconciliation/financial", async (c) => {
		const { sinceDate, untilDate } = getSinceUntilFromQuery(c);
		const sinceIso = formatDateWithTime(new Date(sinceDate), false);
		const untilIso = formatDateWithTime(new Date(untilDate), true);
		const thresholdPctRaw = Number(c.req.query("thresholdPct") || 1);
		const thresholdPct = Number.isFinite(thresholdPctRaw)
			? Math.max(0, thresholdPctRaw)
			: 1;

		const paymentTypeLabels: Record<string, string> = {
			CARD: "Банковской картой:",
			ADVANCE: "Предоплатой (зачетом аванса):",
			CASH: "Нал. средствами:",
			COUNTEROFFER: "Встречным предоставлением:",
			CREDIT: "Постоплатой (в кредит):",
			ELECTRON: "Безналичными средствами:",
			UNKNOWN: "Неизвестно. По-умолчанию:",
		};

		const evo = c.var.evotor;
		const shopUuids = await evo.getShopUuids();
		const shopNamesMap = await evo.getShopNamesByUuids(shopUuids);

		const byShop = await Promise.all(
			shopUuids.map(async (shopUuid) => {
				const documents = await getDocumentsFromIndexFirst(
					c.get("db"),
					evo,
					shopUuid,
					sinceIso,
					untilIso,
					{ types: ["SELL", "PAYBACK"] },
				);

				const paymentAgg = aggregateShopFinancialFromDocuments(
					documents,
					paymentTypeLabels,
				);

				let controlSell = 0;
				let controlRefund = 0;
				let controlChecks = 0;

				for (const doc of documents) {
					if (!["SELL", "PAYBACK"].includes(doc.type)) continue;
					controlChecks += 1;
					for (const tx of doc.transactions || []) {
						if (tx.type !== "REGISTER_POSITION") continue;
						const amount = Math.abs(Number(tx.sum || 0));
						if (amount === 0) continue;
						if (doc.type === "PAYBACK") {
							controlRefund += amount;
						} else {
							controlSell += amount;
						}
					}
				}

				const paymentNet = paymentAgg.totalSell - paymentAgg.totalRefund;
				const controlNet = controlSell - controlRefund;
				const netMismatchAbs = Math.abs(paymentNet - controlNet);
				const netMismatchPct = safePctDiff(paymentNet, controlNet);
				const isWithinThreshold = netMismatchPct <= thresholdPct;

				return {
					shopUuid,
					shopName: shopNamesMap[shopUuid] || shopUuid,
					apiTotals: {
						sell: paymentAgg.totalSell,
						refund: paymentAgg.totalRefund,
						net: paymentNet,
						checks: paymentAgg.checksCount,
					},
					controlTotals: {
						sell: controlSell,
						refund: controlRefund,
						net: controlNet,
						checks: controlChecks,
					},
					netMismatchAbs,
					netMismatchPct,
					isWithinThreshold,
					docsCount: documents.length,
				};
			}),
		);

		const summary = byShop.reduce(
			(acc, row) => {
				acc.api.sell += row.apiTotals.sell;
				acc.api.refund += row.apiTotals.refund;
				acc.api.net += row.apiTotals.net;
				acc.api.checks += row.apiTotals.checks;
				acc.control.sell += row.controlTotals.sell;
				acc.control.refund += row.controlTotals.refund;
				acc.control.net += row.controlTotals.net;
				acc.control.checks += row.controlTotals.checks;
				acc.docsCount += row.docsCount;
				if (!row.isWithinThreshold) acc.outOfThresholdShops += 1;
				return acc;
			},
			{
				api: { sell: 0, refund: 0, net: 0, checks: 0 },
				control: { sell: 0, refund: 0, net: 0, checks: 0 },
				docsCount: 0,
				outOfThresholdShops: 0,
			},
		);

		const totalNetMismatchAbs = Math.abs(summary.api.net - summary.control.net);
		const totalNetMismatchPct = safePctDiff(summary.api.net, summary.control.net);
		const withinThreshold = totalNetMismatchPct <= thresholdPct;

		return c.json({
			period: {
				since: sinceDate,
				until: untilDate,
			},
			thresholdPct,
			withinThreshold,
			totalNetMismatchAbs,
			totalNetMismatchPct,
			summary,
			byShop: byShop.sort((a, b) => b.netMismatchAbs - a.netMismatchAbs),
		});
	})
	.get("/revenue/refund-documents", async (c) => {
		const { sinceDate, untilDate } = getSinceUntilFromQuery(c);
		const sinceIso = formatDateWithTime(new Date(sinceDate), false);
		const untilIso = formatDateWithTime(new Date(untilDate), true);
		const limitRaw = Number(c.req.query("limit") || 100);
		const limit = Number.isFinite(limitRaw)
			? Math.min(Math.max(Math.round(limitRaw), 1), 500)
			: 100;
		const shopUuidFilter = c.req.query("shopUuid") || "";
		const shopNameFilter = c.req.query("shopName") || "";

		const evo = c.var.evotor;
		const allShopUuids = await evo.getShopUuids().catch(async () => {
			const rows = await c
				.get("db")
				.prepare("SELECT store_uuid FROM stores")
				.all<{ store_uuid: string }>();
			return (rows.results || []).map((row) => row.store_uuid).filter(Boolean);
		});
		const allShopNamesMap = await evo.getShopNamesByUuids(allShopUuids).catch(async () => {
			const rows = await c
				.get("db")
				.prepare("SELECT store_uuid, name FROM stores")
				.all<{ store_uuid: string; name: string | null }>();
			const fallbackMap: Record<string, string> = {};
			for (const row of rows.results || []) {
				if (row.store_uuid) fallbackMap[row.store_uuid] = row.name || row.store_uuid;
			}
			return fallbackMap;
		});
		const shopUuids = allShopUuids.filter((shopUuid) => {
			if (shopUuidFilter && shopUuid !== shopUuidFilter) return false;
			if (shopNameFilter && allShopNamesMap[shopUuid] !== shopNameFilter) return false;
			return true;
		});
		const shopNamesMap = await evo.getShopNamesByUuids(shopUuids);

		const refundsRaw = await Promise.all(
			shopUuids.map(async (shopUuid) => {
				const docs = await getDocumentsFromIndexFirst(
					c.get("db"),
					evo,
					shopUuid,
					sinceIso,
					untilIso,
					{ types: ["SELL", "PAYBACK"], skipFetchIfStale: true },
				);
				return docs
					.filter((doc) => doc.type === "PAYBACK")
					.map((doc) => {
						const paymentBreakdown: Record<string, number> = {};
						let refundTotal = 0;
						for (const tx of doc.transactions || []) {
							if (tx.type !== "PAYMENT") continue;
							const amount = Math.abs(Number(tx.sum || 0));
							if (amount === 0) continue;
							const paymentType = tx.paymentType || "UNKNOWN";
							paymentBreakdown[paymentType] =
								(paymentBreakdown[paymentType] || 0) + amount;
							refundTotal += amount;
						}

						const items = (doc.transactions || [])
							.filter((tx) => tx.type === "REGISTER_POSITION")
							.map((tx) => ({
								productName: tx.commodityName || "Неизвестный товар",
								quantity: Number(tx.quantity || 0),
								sum: Math.abs(Number(tx.sum || 0)),
							}))
							.filter((item) => item.sum > 0 || item.quantity > 0);

							return {
								shopUuid,
								shopName: shopNamesMap[shopUuid] || shopUuid,
								documentId: `${shopUuid}-${doc.number}-${doc.closeDate}`,
								documentNumber: doc.number,
								closeDate: doc.closeDate,
								openUserUuid: doc.openUserUuid || "",
							refundTotal,
							paymentBreakdown,
							items,
						};
					});
			}),
		);

		const rows = refundsRaw
			.flat()
			.sort(
				(a, b) =>
					new Date(b.closeDate).getTime() - new Date(a.closeDate).getTime(),
			);
		const limited = rows.slice(0, limit);
		const employeeUuids = Array.from(
			new Set(limited.map((row) => row.openUserUuid).filter(Boolean)),
		);
		const employeeNames =
			employeeUuids.length > 0
				? await evo.getEmployeeNamesByUuids(employeeUuids)
				: {};

		const data = limited.map((row) => ({
			...row,
			employeeName: employeeNames[row.openUserUuid] || "Неизвестный сотрудник",
		}));

		return c.json({
			period: {
				since: sinceDate,
				until: untilDate,
			},
			shopFilter: shopUuidFilter || shopNameFilter || null,
			totalCount: rows.length,
			returnedCount: data.length,
			totalRefund: data.reduce((sum, row) => sum + row.refundTotal, 0),
			documents: data,
		});
	})
	.get("/revenue/hourly-plan-fact", async (c) => {
		const queryDate = c.req.query("date") || formatDateYYYYMMDD(new Date());
		const dateObj = new Date(queryDate);
		if (Number.isNaN(dateObj.getTime())) {
			return c.json({ error: "Invalid date format. Use YYYY-MM-DD." }, 400);
		}

		const evo = c.var.evotor;
		const allShopUuids = await evo.getShopUuids();
		const allShopNamesMap = await evo.getShopNamesByUuids(allShopUuids);
		const shopUuidFilter = c.req.query("shopUuid") || "";
		const shopNameFilter = c.req.query("shopName") || "";
		const shopUuids = allShopUuids.filter((shopUuid) => {
			if (shopUuidFilter && shopUuid !== shopUuidFilter) return false;
			if (shopNameFilter && allShopNamesMap[shopUuid] !== shopNameFilter) return false;
			return true;
		});
		const dateStartIso = formatDateWithTime(dateObj, false);
		const dateEndIso = formatDateWithTime(dateObj, true);

		const docsByShop = await Promise.all(
			shopUuids.map(async (shopUuid) => ({
				shopUuid,
				docs: await getDocumentsFromIndexFirst(
					c.get("db"),
					evo,
					shopUuid,
					dateStartIso,
					dateEndIso,
					{ types: ["SELL", "PAYBACK"] },
				),
			})),
		);

		const autoPlanResult = await computeAutoTotalSalesPlan(c.get("db"), evo, dateObj, {
			historyDays: Number(c.req.query("historyDays") || 28),
			growthBiasPct: Number(c.req.query("growthBiasPct") || 5),
			shopUuidsFilter: shopUuids,
		});
		const totalPlan = autoPlanResult.autoPlan;
		const historyDays = Number(c.req.query("historyDays") || 28);

		const queryOpenHour = c.req.query("openHour");
		const queryCloseHour = c.req.query("closeHour");
		const openingHourFromDb = await resolveOpenHourFromOpenings(
			c.env.DB,
			dateObj,
			shopUuids,
		);
		const openHourRaw = Number(queryOpenHour ?? openingHourFromDb ?? 7);
		const closeHourRaw = Number(queryCloseHour ?? 22);
		const openHour = Number.isFinite(openHourRaw)
			? Math.min(Math.max(Math.round(openHourRaw), 0), 23)
			: Math.min(Math.max(Math.round(openingHourFromDb ?? 7), 0), 23);
		const closeHourCandidate = Number.isFinite(closeHourRaw)
			? Math.min(Math.max(Math.round(closeHourRaw), 0), 23)
			: 22;
		const closeHour = closeHourCandidate < openHour ? openHour : closeHourCandidate;
		const todayMskKey = toMskDateKey(new Date());
		const targetMskKey = toMskDateKey(dateObj);
		const nowMsk = new Date(Date.now() + 3 * 60 * 60 * 1000);
		const currentMskHour = nowMsk.getUTCHours();
		const effectiveCloseHour =
			targetMskKey === todayMskKey
				? Math.max(openHour, Math.min(closeHour, currentMskHour))
				: closeHour;
		const hours = Array.from(
			{ length: effectiveCloseHour - openHour + 1 },
			(_, i) => i + openHour,
		);
		const factByHour = new Map<number, number>(hours.map((h) => [h, 0]));
		const accessoriesByHour = new Map<number, number>(hours.map((h) => [h, 0]));
		const hourlyPlanWeights = await computeHourlyPlanWeights(c.get("db"), evo, dateObj, {
			openHour,
			closeHour,
			historyDays,
			shopUuidsFilter: shopUuids,
		});
		const accessoryGroupUuids = await getAccessoryGroupUuids(c.get("db"));
		const accessoryProductUuidsByShop = new Map<string, Set<string>>();
		if (accessoryGroupUuids.length > 0) {
			const productsByShop = await Promise.all(
				shopUuids.map(async (shopUuid) => ({
					shopUuid,
					productUuids: await getProductsByGroup(
						c.get("db"),
						shopUuid,
						accessoryGroupUuids,
					),
				})),
			);
			for (const item of productsByShop) {
				accessoryProductUuidsByShop.set(item.shopUuid, new Set(item.productUuids));
			}
		}

		for (const { shopUuid, docs } of docsByShop) {
			const accessoryProductUuids = accessoryProductUuidsByShop.get(shopUuid);
			for (const doc of docs) {
				if (!["SELL", "PAYBACK"].includes(doc.type)) continue;

				const date = new Date(doc.closeDate);
				if (Number.isNaN(date.getTime())) continue;
				// Приводим в МСК для визуального анализа темпа.
				date.setHours(date.getHours() + 3);
				const hour = date.getHours();
				if (!factByHour.has(hour)) continue;

				let docDelta = 0;
				for (const tx of doc.transactions || []) {
					if (tx.type !== "PAYMENT") continue;
					const rawAmount = Number(tx.sum || 0);
					if (!Number.isFinite(rawAmount) || rawAmount === 0) continue;
					if (doc.type === "PAYBACK") {
						docDelta -= Math.abs(rawAmount);
					} else {
						docDelta += rawAmount;
					}
				}
				factByHour.set(hour, (factByHour.get(hour) || 0) + docDelta);

				if (accessoryProductUuids && accessoryProductUuids.size > 0) {
					let accessoryDelta = 0;
					for (const tx of doc.transactions || []) {
						if (tx.type !== "REGISTER_POSITION") continue;
						if (!accessoryProductUuids.has(tx.commodityUuid)) continue;
						const sum = Number(tx.sum || 0);
						if (!Number.isFinite(sum) || sum === 0) continue;
						if (doc.type === "PAYBACK") {
							accessoryDelta -= Math.abs(sum);
						} else {
							accessoryDelta += Math.abs(sum);
						}
					}
					accessoriesByHour.set(
						hour,
						(accessoriesByHour.get(hour) || 0) + accessoryDelta,
					);
				}
			}
		}

		let cumulativeActual = 0;
		let cumulativeExpected = 0;
		let cumulativeAccessories = 0;
		let worstGap = 0;
		let worstHour = openHour;

		const rows = hours.map((hour) => {
			const actualHourly = factByHour.get(hour) || 0;
			const accessoriesHourly = accessoriesByHour.get(hour) || 0;
			cumulativeActual += actualHourly;
			cumulativeAccessories += accessoriesHourly;
			const hourWeight = hourlyPlanWeights.weights.get(hour) || 0;
			const expectedHourly = totalPlan > 0 ? totalPlan * hourWeight : 0;
			cumulativeExpected += expectedHourly;
			const expectedCumulative = cumulativeExpected;
			const gap = cumulativeActual - expectedCumulative;
			if (gap < worstGap) {
				worstGap = gap;
				worstHour = hour;
			}
			return {
				hour,
				label: `${String(hour).padStart(2, "0")}:00`,
				actualHourly,
				accessoriesHourly,
				accessoriesCumulative: cumulativeAccessories,
				actualCumulative: cumulativeActual,
				expectedCumulative,
				gap,
			};
		});

		return c.json({
			date: queryDate,
			shopFilter: shopUuidFilter || shopNameFilter || "all",
			totalPlan,
			planSource: "auto_total_sales",
			planMeta: autoPlanResult.meta,
			window: {
				openHour,
				closeHour,
				source:
					queryOpenHour != null && queryOpenHour !== ""
						? "query"
						: openingHourFromDb != null
							? "openings_db"
							: "default",
			},
			actualNet: rows.length > 0 ? rows[rows.length - 1].actualCumulative : 0,
			rows,
			hourlyPlanMeta: hourlyPlanWeights.meta,
			worstGap: {
				hour: worstHour,
				label: `${String(worstHour).padStart(2, "0")}:00`,
				value: worstGap,
			},
		});
	})
	.get("/revenue/auto-total-plan", async (c) => {
		const queryDate = c.req.query("date") || formatDateYYYYMMDD(new Date());
		const dateObj = new Date(queryDate);
		if (Number.isNaN(dateObj.getTime())) {
			return c.json({ error: "Invalid date format. Use YYYY-MM-DD." }, 400);
		}
		const allShopUuids = await c.var.evotor.getShopUuids();
		const allShopNamesMap = await c.var.evotor.getShopNamesByUuids(allShopUuids);
		const shopUuidFilter = c.req.query("shopUuid") || "";
		const shopNameFilter = c.req.query("shopName") || "";
		const filteredShopUuids = allShopUuids.filter((shopUuid) => {
			if (shopUuidFilter && shopUuid !== shopUuidFilter) return false;
			if (shopNameFilter && allShopNamesMap[shopUuid] !== shopNameFilter)
				return false;
			return true;
		});

			const result = await computeAutoTotalSalesPlan(c.get("db"), c.var.evotor, dateObj, {
				historyDays: Number(c.req.query("historyDays") || 28),
				growthBiasPct: Number(c.req.query("growthBiasPct") || 5),
				shopUuidsFilter: filteredShopUuids,
		});
		return c.json({
			date: queryDate,
			shopFilter: shopUuidFilter || shopNameFilter || "all",
			totalPlan: result.autoPlan,
			planSource: "auto_total_sales",
			planMeta: result.meta,
		});
	});
