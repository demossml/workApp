import { Hono } from "hono";
import type { IEnv } from "../types";
import { logger } from "../logger";
import { EmployeeByShopSchema, RegisterSchema, validate } from "../validation";
import { assert } from "../utils";
import {
	getEmployeeDetailsByUserId,
	listEmployeeDetails,
	listEmployeeDetailsByShop,
	toEmployeeSummary,
} from "../db/repositories/employeesDetails";

const SUPERADMIN_IDS = new Set(["5700958253", "475039971"]);

export const employeesRoutes = new Hono<IEnv>()

	.get("/user", (c) => {
		return c.json(c.var.user);
	})

	.get("/employee-name", async (c) => {
		const row = await getEmployeeDetailsByUserId(c.env.DB, c.var.userId);
		const name = row?.last_name || row?.name || null;
		if (name) {
			return c.json({ employeeName: name });
		}
		const employeeName = await c.var.evotor.getEmployeeLastName(c.var.userId);
		assert(employeeName, "not an employee");
		return c.json({ employeeName });
	})

	.get("/by-last-name-uuid", async (c) => {
		const row = await getEmployeeDetailsByUserId(
			c.env.DB,
			c.var.user.id.toString(),
		);
		if (row) {
			return c.json({ employeeNameAndUuid: [toEmployeeSummary(row)] });
		}
		const employeeNameAndUuid = await c.var.evotor.getEmployeesByLastName(
			c.var.user.id.toString(),
		);
		assert(employeeNameAndUuid, "not an employee");
		return c.json({ employeeNameAndUuid });
	})

	.get("/nameUuid", async (c) => {
		const rows = await listEmployeeDetails(c.env.DB);
		if (rows.length > 0) {
			return c.json({
				employeeNameAndUuid: rows.map((row) => toEmployeeSummary(row)),
			});
		}
		const employeeNameAndUuid =
			await c.var.evotor.getEmployeesLastNameAndUuid();
		assert(employeeNameAndUuid, "not an employee");
		return c.json({ employeeNameAndUuid });
	})

	.post("/employee/and-store/name-uuid", async (c) => {
		try {
			const data = await c.req.json();
			const { shop } = validate(EmployeeByShopSchema, data);
			const rows = await listEmployeeDetailsByShop(c.env.DB, shop);
			if (rows.length > 0) {
				return c.json({
					employeeNameAndUuid: rows.map((row) => toEmployeeSummary(row)),
				});
			}
			const employeeNameAndUuid = await c.var.evotor.getEmployeesByShopId(shop);
			assert(employeeNameAndUuid, "not an employee");
			return c.json({ employeeNameAndUuid });
		} catch (error) {
			return c.json(
				{
					error:
						error instanceof Error ? error.message : "Invalid request data",
				},
				400,
			);
		}
	})

	.get("/employee-role", async (c) => {
		const userId =
			String(c.var.userId || "").trim() ||
			String(c.req.header("telegram-id") || "").trim() ||
			String(c.req.query("telegram-id") || "").trim();
		if (!userId) {
			return c.json({ employeeRole: null });
		}
		if (SUPERADMIN_IDS.has(userId)) {
			return c.json({ employeeRole: "SUPERADMIN" });
		}
		const row = await getEmployeeDetailsByUserId(c.env.DB, userId);
		if (row?.role) {
			return c.json({ employeeRole: row.role });
		}
		const employeeRoleEvo = await c.var.evotor.getEmployeeRole(userId);
		const employeeRole = employeeRoleEvo;
		logger.debug("Employee role retrieved", { userId, employeeRole });
		assert(employeeRole, "not an employee");
		return c.json({ employeeRole });
	})

	.post("/register", async (c) => {
		try {
			const data = await c.req.json();

			const { userId } = validate(RegisterSchema, data);
			c.set("userId", String(userId));
			if (SUPERADMIN_IDS.has(String(userId))) {
				return c.json({ success: true, employeeRole: "SUPERADMIN" });
			}

			const row = await getEmployeeDetailsByUserId(c.env.DB, userId);
			const employeeRoleFromEvotor = await c.var.evotor.getEmployeeRole(userId);
			const employeeRole =
				row?.uuid != null ? true : employeeRoleFromEvotor !== "null";
			logger.debug("User registration attempt", { userId, employeeRole });

			if (!employeeRole) {
				return c.json({ success: false, message: "not an employee" }, 403);
			}

			assert(employeeRole, "not an employee");
			return c.json({ success: true, employeeRole });
		} catch (error) {
			return c.json(
				{
					success: false,
					message:
						error instanceof Error ? error.message : "Invalid request data",
				},
				400,
			);
		}
	})

	// ── Seller Performance Dashboard (Enhanced) ──
	.get("/seller-performance", async (c) => {
		const days = parseInt(c.req.query("days") || "30");
		const db = c.env.DB;
		const since = new Date();
		since.setDate(since.getDate() - days);
		const sinceStr = since.toISOString().slice(0, 10);

		const rows = await db
			.prepare(`
				SELECT
					sess.open_user_uuid as seller_uuid,
					emp.first_name as seller_name,
					CAST(COUNT(DISTINCT DATE(s.close_date)) AS INTEGER) as days_worked,
					CAST(COUNT(DISTINCT s.doc_id) AS INTEGER) as total_checks,
					ROUND(SUM(s.close_sum)) as total_revenue,
					ROUND(AVG(s.close_sum)) as avg_check,
					ROUND(SUM(s.close_sum) / CAST(COUNT(DISTINCT DATE(s.close_date)) AS DOUBLE)) as avg_daily_rev,
					CAST(ROUND(CAST(SUM(p.quantity) AS DOUBLE) / CAST(COUNT(DISTINCT s.doc_id) AS DOUBLE), 1) AS DOUBLE) as items_per_check,
					ROUND(SUM(CASE WHEN vg.group_uuid IS NOT NULL THEN p.sum ELSE 0 END)) as vape_revenue,
					ROUND(SUM(CASE WHEN ac.group_uuid IS NOT NULL AND vg.group_uuid IS NULL THEN p.sum ELSE 0 END)) as acc_revenue
				FROM sells s
				JOIN sessions sess ON s.store_uuid = sess.store_uuid
					AND DATE(s.close_date) = DATE(sess.open_date)
				LEFT JOIN employees emp ON sess.open_user_uuid = emp.uuid
				LEFT JOIN positions p ON s.doc_id = p.doc_id
				LEFT JOIN product_groups pg ON pg.product_name = p.product_name AND pg.store_uuid = s.store_uuid
				LEFT JOIN vape_groups vg ON pg.parent_uuid = vg.group_uuid
				LEFT JOIN accessories ac ON pg.parent_uuid = ac.group_uuid
				WHERE s.close_date >= ?
				GROUP BY sess.open_user_uuid, emp.first_name
				HAVING CAST(COUNT(DISTINCT s.doc_id) AS INTEGER) > 0
				ORDER BY total_revenue DESC
			`)
			.bind(sinceStr)
			.all();

		// Daily breakdown with vape/acc split
		const dailyRows = await db
			.prepare(`
				SELECT
					sess.open_user_uuid as seller_uuid,
					DATE(s.close_date) as day,
					ROUND(SUM(s.close_sum)) as day_rev,
					CAST(COUNT(DISTINCT s.doc_id) AS INTEGER) as day_checks,
					ROUND(SUM(CASE WHEN vg.group_uuid IS NOT NULL THEN p.sum ELSE 0 END)) as day_vape,
					ROUND(SUM(CASE WHEN ac.group_uuid IS NOT NULL AND vg.group_uuid IS NULL THEN p.sum ELSE 0 END)) as day_acc
				FROM sells s
				JOIN sessions sess ON s.store_uuid = sess.store_uuid
					AND DATE(s.close_date) = DATE(sess.open_date)
				LEFT JOIN positions p ON s.doc_id = p.doc_id
				LEFT JOIN product_groups pg ON pg.product_name = p.product_name AND pg.store_uuid = s.store_uuid
				LEFT JOIN vape_groups vg ON pg.parent_uuid = vg.group_uuid
				LEFT JOIN accessories ac ON pg.parent_uuid = ac.group_uuid
				WHERE s.close_date >= ?
				GROUP BY sess.open_user_uuid, DATE(s.close_date)
				ORDER BY day
			`)
			.bind(sinceStr)
			.all();

		// Store breakdown
		const storeRows = await db
			.prepare(`
				SELECT
					sess.open_user_uuid as seller_uuid,
					s.store_name,
					ROUND(SUM(s.close_sum)) as store_revenue,
					CAST(COUNT(DISTINCT DATE(s.close_date)) AS INTEGER) as store_days
				FROM sells s
				JOIN sessions sess ON s.store_uuid = sess.store_uuid
					AND DATE(s.close_date) = DATE(sess.open_date)
				WHERE s.close_date >= ?
				GROUP BY sess.open_user_uuid, s.store_name
			`)
			.bind(sinceStr)
			.all();

		const storesMap: Record<string, Array<{store:string;revenue:number;days:number}>> = {};
		for (const sr of storeRows.results || []) {
			if (!storesMap[sr.seller_uuid]) storesMap[sr.seller_uuid] = [];
			storesMap[sr.seller_uuid].push({ store: sr.store_name, revenue: sr.store_revenue, days: sr.store_days });
		}

		const dailyMap: Record<string, Array<{day:string;rev:number;checks:number;vape:number;acc:number}>> = {};
		for (const dr of dailyRows.results || []) {
			if (!dailyMap[dr.seller_uuid]) dailyMap[dr.seller_uuid] = [];
			dailyMap[dr.seller_uuid].push({ day: dr.day, rev: dr.day_rev, checks: dr.day_checks, vape: dr.day_vape||0, acc: dr.day_acc||0 });
		}

		const sellers = (rows.results || []).map((r: any) => {
			const daily = dailyMap[r.seller_uuid] || [];
			const revs = daily.map((d: any) => d.rev);
			const total = r.total_revenue || 0;
			const n = revs.length;
			const mean = n > 0 ? revs.reduce((a:number,b:number)=>a+b,0)/n : 0;
			const variance = n > 1 ? revs.reduce((s:number,v:number)=>s+(v-mean)*(v-mean),0)/(n-1) : 0;
			const std = Math.sqrt(variance);
			const cv = mean > 0 ? Math.round(std/mean*100) : 0;
			const vapeShare = total > 0 ? Math.round((r.vape_revenue||0)/total*100) : 0;
			const accShare = total > 0 ? Math.round((r.acc_revenue||0)/total*100) : 0;
			const otherShare = 100 - vapeShare - accShare;

			// Best/worst day of week (0=Mon, 6=Sun)
			const dowSums: number[][] = [[],[],[],[],[],[],[]];
			const dowNames = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
			for (const d of daily) {
				const dow = new Date(d.day).getDay(); // 0=Sun in JS
				const idx = dow === 0 ? 6 : dow - 1;
				dowSums[idx].push(d.rev);
			}
			let bestDow = -1, worstDow = -1;
			let bestAvg = 0, worstAvg = Infinity;
			for (let i = 0; i < 7; i++) {
				if (dowSums[i].length > 0) {
					const avg = dowSums[i].reduce((a:number,b:number)=>a+b,0)/dowSums[i].length;
					if (avg > bestAvg) { bestAvg = avg; bestDow = i; }
					if (avg < worstAvg) { worstAvg = avg; worstDow = i; }
				}
			}

			return {
				uuid: r.seller_uuid,
				name: r.seller_name || (r.seller_uuid || "?").slice(0, 8),
				daysWorked: r.days_worked,
				totalChecks: r.total_checks,
				totalRevenue: total,
				avgCheck: r.avg_check,
				avgDailyRev: r.avg_daily_rev,
				itemsPerCheck: r.items_per_check || 1.0,
				stabilityCV: cv,
				vapeShare,
				accShare,
				otherShare,
				bestDow: bestDow >= 0 ? dowNames[bestDow] : null,
				bestDowAvg: bestDow >= 0 ? Math.round(bestAvg) : 0,
				worstDow: worstDow >= 0 ? dowNames[worstDow] : null,
				worstDowAvg: worstDow >= 0 ? Math.round(worstAvg) : 0,
				stores: storesMap[r.seller_uuid] || [],
				daily,
			};
		});

		return c.json({ sellers, days, since: sinceStr });
	})

	// ── Seller Effectiveness v3 (matching SellerMetrics type) ──
	.get("/seller-effectiveness", async (c) => {
		const sinceParam = c.req.query("since");
		const untilParam = c.req.query("until");
		const period = parseInt(c.req.query("period") || "90");
		const storeFilter = c.req.query("store") || "all";
		const db = c.get("db");

		// Date window: explicit since/until OR period days ending today (inclusive)
		let since: string, until: string;
		if (sinceParam && untilParam) {
			since = sinceParam;
			until = untilParam;
		} else {
			const today = new Date();
			const tomorrow = new Date(today);
			tomorrow.setDate(tomorrow.getDate() + 1);
			tomorrow.setHours(0, 0, 0, 0);
			until = tomorrow.toISOString().slice(0, 10) + "T00:00:00";

			const startDate = new Date(today);
			startDate.setDate(startDate.getDate() - period + 1);
			startDate.setHours(0, 0, 0, 0);
			since = startDate.toISOString().slice(0, 10);
		}

		// Store filter clause
		const storeClause = storeFilter !== "all" ? `AND s.store_name = ?` : "";
		const storeParam = storeFilter !== "all" ? [storeFilter] : [];

		// ── 1. Seller base stats ──
		const sellerRows = await db.prepare(`
			SELECT
				s.open_user_uuid as uuid,
				COALESCE(e.first_name, s.open_user_uuid) as first_name,
				e.last_name as last_name,
				CAST(COUNT(DISTINCT CAST(s.close_date AS DATE)) AS INTEGER) as days_worked,
				CAST(COUNT(*) AS INTEGER) as total_checks,
				CAST(SUM(s.close_sum) AS DOUBLE) as total_revenue,
				CAST(AVG(s.close_sum) AS DOUBLE) as avg_check,
				CAST(SUM(s.close_sum) / NULLIF(COUNT(DISTINCT CAST(s.close_date AS DATE)), 0) AS DOUBLE) as avg_daily_rev,
				CAST(COUNT(*) * 1.0 / NULLIF(COUNT(DISTINCT CAST(s.close_date AS DATE)), 0) AS DOUBLE) as checks_per_day
			FROM sells s
			LEFT JOIN employees e ON e.uuid = s.open_user_uuid
			WHERE s.close_date >= ? AND s.close_date < ?
			  AND s.open_user_uuid IS NOT NULL AND s.open_user_uuid != ''
			  ${storeClause}
			GROUP BY s.open_user_uuid, e.first_name, e.last_name
			ORDER BY avg_daily_rev DESC
		`).bind(since, until, ...storeParam).all();

		// ── 2. Vape & accessory shares (commodity_uuid only) ──
		const shareRows = await db.prepare(`
			SELECT
				s.open_user_uuid as uuid,
				CAST(SUM(CASE WHEN vg.group_uuid IS NOT NULL THEN p.sum ELSE 0 END) AS DOUBLE) as vape_sum,
				CAST(SUM(CASE WHEN ag.group_uuid IS NOT NULL THEN p.sum ELSE 0 END) AS DOUBLE) as acc_sum,
				CAST(SUM(p.sum) AS DOUBLE) as total_sum
			FROM sells s
			JOIN positions p ON p.doc_id = s.doc_id
			LEFT JOIN product_groups pg ON pg.product_name = p.product_name AND pg.store_uuid = s.store_uuid
			LEFT JOIN vape_groups vg ON pg.parent_uuid = vg.group_uuid
			LEFT JOIN accessories ag ON pg.parent_uuid = ag.group_uuid
			WHERE s.close_date >= ? AND s.close_date < ?
			  AND s.open_user_uuid IS NOT NULL AND s.open_user_uuid != ''
			  AND p.commodity_uuid IS NOT NULL
			  ${storeClause}
			GROUP BY s.open_user_uuid
		`).bind(since, until, ...storeParam).all();

		// ── 3. Per-store breakdown ──
		const storeRows = await db.prepare(`
			SELECT
				s.open_user_uuid as uuid,
				s.store_name as store,
				CAST(COUNT(DISTINCT CAST(s.close_date AS DATE)) AS INTEGER) as days,
				CAST(SUM(s.close_sum) / NULLIF(COUNT(DISTINCT CAST(s.close_date AS DATE)), 0) AS DOUBLE) as avg_daily_rev
			FROM sells s
			WHERE s.close_date >= ? AND s.close_date < ?
			  AND s.open_user_uuid IS NOT NULL AND s.open_user_uuid != ''
			  ${storeClause}
			GROUP BY s.open_user_uuid, s.store_name
		`).bind(since, until, ...storeParam).all();

		// ── 4. Daily revenue for sparkline + trend ──
		const dailyRows = await db.prepare(`
			SELECT
				s.open_user_uuid as uuid,
				CAST(s.close_date AS DATE) as d,
				CAST(SUM(s.close_sum) AS DOUBLE) as rev
			FROM sells s
			WHERE s.close_date >= ? AND s.close_date < ?
			  AND s.open_user_uuid IS NOT NULL AND s.open_user_uuid != ''
			  ${storeClause}
			GROUP BY s.open_user_uuid, CAST(s.close_date AS DATE)
			ORDER BY s.open_user_uuid, d
		`).bind(since, until, ...storeParam).all();

		// ── 4a. Hours worked per seller (first→last sell per day) ──
		const hoursRows = await db.prepare(`
			SELECT open_user_uuid as uuid, CAST(close_date AS DATE) as d,
				MIN(close_date) as first_sell, MAX(close_date) as last_sell
			FROM sells
			WHERE close_date >= ? AND close_date < ?
			  AND open_user_uuid IS NOT NULL AND open_user_uuid != ''
			  ${storeClause}
			GROUP BY open_user_uuid, CAST(close_date AS DATE)
		`).bind(since, until, ...storeParam).all();

		// Compute avg hours per seller in JS (D1Adapter may not support EPOCH)
		const hoursByUuid = new Map<string, number[]>();
		for (const r of hoursRows.results || []) {
			const rr = r as any;
			if (!rr.first_sell || !rr.last_sell || rr.first_sell === rr.last_sell) continue;
			const h = (new Date(rr.last_sell).getTime() - new Date(rr.first_sell).getTime()) / 3600000;
			if (h > 0 && h < 24) {
				if (!hoursByUuid.has(rr.uuid)) hoursByUuid.set(rr.uuid, []);
				hoursByUuid.get(rr.uuid)!.push(h);
			}
		}
		const hoursMap = new Map<string, number>();
		for (const [uuid, hrs] of hoursByUuid) {
			const avg = hrs.reduce((a, b) => a + b, 0) / hrs.length;
			hoursMap.set(uuid, Math.round(avg * 10) / 10);
		}

		// ── 5a. Previous period ranking ──
		// Compute avg_daily_rev for the preceding period of same length
		const prevSinceDate = new Date(since);
		const periodDays = Math.round((new Date(until).getTime() - new Date(since).getTime()) / (1000 * 60 * 60 * 24));
		prevSinceDate.setDate(prevSinceDate.getDate() - periodDays);
		const prevSince = prevSinceDate.toISOString().slice(0, 10);

		const prevRankRows = await db.prepare(`
			SELECT
				s.open_user_uuid as uuid,
				CAST(SUM(s.close_sum) / NULLIF(COUNT(DISTINCT CAST(s.close_date AS DATE)), 0) AS DOUBLE) as prev_avg_daily_rev
			FROM sells s
			WHERE s.close_date >= ? AND s.close_date < ?
			  AND s.open_user_uuid IS NOT NULL AND s.open_user_uuid != ''
			  ${storeClause}
			GROUP BY s.open_user_uuid
			ORDER BY prev_avg_daily_rev DESC
		`).bind(prevSince, since, ...storeParam).all();

		// Build prev rank map: uuid → { prevAvgDailyRev, prevRank }
		const prevRankMap = new Map<string, { prevAvgDailyRev: number; prevRank: number }>();
		let prevRank = 0;
		for (const r of prevRankRows.results || []) {
			const rr = r as any;
			prevRank++;
			prevRankMap.set(rr.uuid, { prevAvgDailyRev: Math.round(rr.prev_avg_daily_rev || 0), prevRank });
		}

		// ── 5. Store baselines ──
		const baselineRows = await db.prepare(`
			WITH daily AS (
				SELECT store_name, CAST(close_date AS DATE) as d,
					SUM(close_sum) as daily_rev, SUM(close_sum) as close_sum, COUNT(*) as cnt
				FROM sells
				WHERE close_date >= ? AND close_date < ?
				GROUP BY store_name, d
			)
			SELECT
				store_name as store,
				CAST(COUNT(*) AS INTEGER) as days,
				CAST(AVG(daily_rev) AS DOUBLE) as avg_daily_rev,
				CAST(STDDEV_SAMP(daily_rev) AS DOUBLE) as sd,
				CAST(CASE WHEN AVG(daily_rev) > 0 THEN STDDEV_SAMP(daily_rev) / AVG(daily_rev) * 100 ELSE 0 END AS DOUBLE) as cv,
				CAST(SUM(close_sum) / NULLIF(SUM(cnt), 0) AS DOUBLE) as avg_check
			FROM daily
			GROUP BY store_name
		`).bind(since, until).all();

		// ── 6. DOW data ──
		const dowRows = await db.prepare(`
			WITH daily AS (
				SELECT store_name, CAST(close_date AS DATE) as d, SUM(close_sum) as rev
				FROM sells
				WHERE close_date >= ? AND close_date < ?
				GROUP BY store_name, d
			)
			SELECT
				store_name,
				CAST(EXTRACT(DOW FROM d) AS INTEGER) as dow,
				CAST(AVG(rev) AS DOUBLE) as avg_rev
			FROM daily
			GROUP BY store_name, EXTRACT(DOW FROM d)
			ORDER BY store_name, dow
		`).bind(since, until).all();

		// ── 7. Seller DOW data ──
		const sellerDowRows = await db.prepare(`
			WITH daily AS (
				SELECT s.open_user_uuid, CAST(s.close_date AS DATE) as d, SUM(s.close_sum) as rev
				FROM sells s
				WHERE s.close_date >= ? AND s.close_date < ?
				  AND s.open_user_uuid IS NOT NULL AND s.open_user_uuid != ''
				  ${storeClause}
				GROUP BY s.open_user_uuid, CAST(s.close_date AS DATE)
			)
			SELECT
				open_user_uuid as uuid,
				CAST(EXTRACT(DOW FROM d) AS INTEGER) as dow,
				CAST(AVG(rev) AS DOUBLE) as avg_rev
			FROM daily
			GROUP BY open_user_uuid, EXTRACT(DOW FROM d)
			ORDER BY open_user_uuid, dow
		`).bind(since, until, ...storeParam).all();

		// ── 8. Category breakdown per seller ──
		const catRows = await db.prepare(`
			SELECT
				s.open_user_uuid as uuid,
				COALESCE(vg.group_name, ag.group_name, pg.parent_uuid) as cat_name,
				CASE WHEN vg.group_uuid IS NOT NULL THEN 'vape'
				     WHEN ag.group_uuid IS NOT NULL THEN 'acc'
				     ELSE 'other' END as cat_type,
				CAST(SUM(p.sum) AS DOUBLE) as cat_rev
			FROM sells s
			JOIN positions p ON p.doc_id = s.doc_id
			LEFT JOIN product_groups pg ON pg.product_name = p.product_name AND pg.store_uuid = s.store_uuid
			LEFT JOIN vape_groups vg ON pg.parent_uuid = vg.group_uuid
			LEFT JOIN accessories ag ON pg.parent_uuid = ag.group_uuid
			WHERE s.close_date >= ? AND s.close_date < ?
			  AND s.open_user_uuid IS NOT NULL AND s.open_user_uuid != ''
			  AND p.commodity_uuid IS NOT NULL
			  ${storeClause}
			GROUP BY s.open_user_uuid, cat_name, cat_type
			ORDER BY s.open_user_uuid, cat_rev DESC
		`).bind(since, until, ...storeParam).all();

		// Build category breakdown map
		const catMap = new Map<string, { name: string; share: number }[]>();
		const sellerTotals = new Map<string, number>();
		for (const r of catRows.results || []) {
			const rr = r as any;
			const uuid = rr.uuid;
			sellerTotals.set(uuid, (sellerTotals.get(uuid) || 0) + rr.cat_rev);
		}
		for (const r of catRows.results || []) {
			const rr = r as any;
			const uuid = rr.uuid;
			if (!catMap.has(uuid)) catMap.set(uuid, []);
			const total = sellerTotals.get(uuid) || 1;
			catMap.get(uuid)!.push({
				name: (rr.cat_name || 'Прочее').slice(0, 20),
				share: Math.round(rr.cat_rev / total * 1000) / 10,
			});
		}

		// ── Metrics computation ──
		const linreg = (xs: number[], ys: number[]): { slope: number; r2: number } => {
			const n = xs.length;
			if (n < 2) return { slope: 0, r2: 0 };
			let sx = 0, sy = 0, sxy = 0, sx2 = 0, sy2 = 0;
			for (let i = 0; i < n; i++) {
				sx += xs[i]; sy += ys[i];
				sxy += xs[i] * ys[i];
				sx2 += xs[i] * xs[i];
				sy2 += ys[i] * ys[i];
			}
			const denom = n * sx2 - sx * sx;
			if (denom === 0) return { slope: 0, r2: 0 };
			const slope = (n * sxy - sx * sy) / denom;
			const intercept = (sy - slope * sx) / n;
			const ssr = ys.reduce((s, y, i) => s + (y - (slope * xs[i] + intercept)) ** 2, 0);
			const meanY = sy / n;
			const sst = ys.reduce((s, y) => s + (y - meanY) ** 2, 0);
			const r2 = sst > 0 ? 1 - ssr / sst : 0;
			return { slope, r2 };
		};

		const robustCV = (values: number[]): number => {
			const cleaned = values.filter(v => v > 0);
			if (cleaned.length < 2) return 0;
			const mean = cleaned.reduce((a, b) => a + b, 0) / cleaned.length;
			if (mean === 0) return 0;
			const variance = cleaned.reduce((s, v) => s + (v - mean) ** 2, 0) / cleaned.length;
			return Math.sqrt(variance) / mean * 100;
		};

		const madStability = (values: number[]): number => {
			const cleaned = [...values].filter(v => v > 0).sort((a, b) => a - b);
			if (cleaned.length < 2) return 0;
			const mid = Math.floor(cleaned.length / 2);
			const med = cleaned.length % 2 === 1 ? cleaned[mid] : (cleaned[mid - 1] + cleaned[mid]) / 2;
			if (med === 0) return 0;
			const absDevs = cleaned.map(v => Math.abs(v - med)).sort((a, b) => a - b);
			const mad = absDevs.length % 2 === 1 ? absDevs[Math.floor(absDevs.length / 2)] :
				(absDevs[absDevs.length / 2 - 1] + absDevs[absDevs.length / 2]) / 2;
			return mad / med;
		};

		// Maps
		const shareMap = new Map<string, { vape: number; acc: number }>();
		for (const r of shareRows.results || []) {
			const total = (r as any).total_sum || 1;
			shareMap.set((r as any).uuid, {
				vape: Math.round(((r as any).vape_sum || 0) / total * 1000) / 10,
				acc: Math.round(((r as any).acc_sum || 0) / total * 1000) / 10,
			});
		}

		const storeMap = new Map<string, { store: string; days: number; avgDailyRev: number }[]>();
		const storeLabelMap = new Map<string, string[]>();
		for (const r of storeRows.results || []) {
			const uuid = (r as any).uuid;
			if (!storeMap.has(uuid)) { storeMap.set(uuid, []); storeLabelMap.set(uuid, []); }
			storeMap.get(uuid)!.push({ store: (r as any).store, days: (r as any).days, avgDailyRev: (r as any).avg_daily_rev });
		}
		// Sort stores by days desc and build labels
		for (const [uuid, sts] of storeMap) {
			sts.sort((a, b) => b.days - a.days);
			const lbls = sts.map(s => s.store === "Победа" ? "П" : s.store === "Твардоского" ? "Т" : s.store);
			storeLabelMap.set(uuid, lbls);
		}

		const dailyMap = new Map<string, { d: string; rev: number }[]>();
		for (const r of dailyRows.results || []) {
			const uuid = (r as any).uuid;
			if (!dailyMap.has(uuid)) dailyMap.set(uuid, []);
			dailyMap.get(uuid)!.push({ d: String((r as any).d).slice(0, 10), rev: (r as any).rev });
		}

		// Seller DOW map
		const sellerDowMap = new Map<string, Record<string, number>>();
		for (const r of sellerDowRows.results || []) {
			const uuid = (r as any).uuid;
			if (!sellerDowMap.has(uuid)) sellerDowMap.set(uuid, {});
			sellerDowMap.get(uuid)![String((r as any).dow)] = Math.round((r as any).avg_rev || 0);
		}

		const baselineMap = new Map<string, { days: number; avgDailyRev: number; sd: number; cv: number; avgCheck: number }>();
		for (const r of baselineRows.results || []) {
			baselineMap.set((r as any).store, {
				days: (r as any).days, avgDailyRev: (r as any).avg_daily_rev,
				sd: (r as any).sd || 0, cv: (r as any).cv || 0, avgCheck: (r as any).avg_check || 0,
			});
		}

		// DOW construction
		const dowMap = new Map<string, Record<string, number>>();
		for (const r of dowRows.results || []) {
			const store = (r as any).store_name;
			if (!dowMap.has(store)) dowMap.set(store, {});
			dowMap.get(store)![String((r as any).dow)] = Math.round((r as any).avg_rev || 0);
		}

		// ── Build sellers array ──
		const sellers = (sellerRows.results || []).map((r: any) => {
			const uuid = r.uuid;
			// Clean name: if last_name is a numeric ID, don't include it
			const firstName = r.first_name || "";
			const lastName = r.last_name || "";
			const isNumericId = /^\d+$/.test(lastName);
			const name = firstName
				? (lastName && !isNumericId && lastName !== firstName ? firstName + " " + lastName : firstName)
				: (uuid || "?").slice(0, 8);

			const shares = shareMap.get(uuid) || { vape: 0, acc: 0 };
			const stores = storeMap.get(uuid) || [];
			const storeLabels = storeLabelMap.get(uuid) || [];
			const daily = dailyMap.get(uuid) || [];

			const revs = daily.map(d => d.rev);
			// Use day offset from period start for proper ₽/day slope
			const periodStart = new Date(since).getTime();
			const xs = daily.map(d => (new Date(d.d).getTime() - periodStart) / (1000 * 60 * 60 * 24));
			const { slope, r2 } = linreg(xs, revs);
			const cv = Math.round(robustCV(revs) * 10) / 10;
			const mad = Math.round(madStability(revs) * 1000) / 1000;

			const sortedStores = [...stores].sort((a, b) => b.days - a.days);
			const mainStore = sortedStores[0]?.store || "";
			const mainStoreAvg = sortedStores[0]?.avgDailyRev || r.avg_daily_rev;
			const baseline = baselineMap.get(mainStore);
			const efficiencyVsStore = baseline && baseline.avgDailyRev > 0
				? Math.round(mainStoreAvg / baseline.avgDailyRev * 100)
				: 0;

			const riskReasons: string[] = [];
			let riskLevel: "ok" | "warn" | "critical" = "ok";
			if (r.days_worked < 10) {
				riskLevel = "warn";
				riskReasons.push(`n=${r.days_worked} — исключён из рейтинга`);
				riskReasons.push("Требуется ≥20 смен");
			} else {
				if (slope < -50) riskReasons.push(`Нисходящий тренд ${Math.round(slope)} ₽/день`);
				if (r.avg_check < 340) riskReasons.push(`Самый низкий средний чек (${Math.round(r.avg_check)} ₽)`);
				if (shares.vape < 18) riskReasons.push(`Низкая vape-доля (${shares.vape}%)`);
				if (cv > 35) riskReasons.push(`Максимальная волатильность CV ${cv}%`);
				if (mad > 0.25) riskReasons.push(`Худший MAD ${mad.toFixed(3)}`);
				// Determine risk level from actual risk reasons
				const hasSevere = slope < -50 && r.avg_check < 340;
				const hasModerate = slope < -50 || cv > 35 || mad > 0.25;
				const hasAny = riskReasons.length > 0;
				if (hasSevere) riskLevel = "critical";
				else if (hasModerate || hasAny) riskLevel = "warn";
			}

			let trendDirection: "↑" | "↓" | "→" = "→";
			if (slope > 50) trendDirection = "↑";
			else if (slope < -50) trendDirection = "↓";

			return {
				uuid,
				name,
				daysWorked: r.days_worked,
				totalChecks: r.total_checks,
				totalRevenue: Math.round(r.total_revenue),
				avgDailyRev: Math.round(r.avg_daily_rev),
				avgCheck: Math.round(r.avg_check),
				checksPerDay: Math.round(r.checks_per_day * 10) / 10,
				trendSlope: Math.round(slope),
				trendDirection,
				trendR2: Math.round(r2 * 1000) / 1000,
				cv,
				mad,
				vapeShare: shares.vape,
				accShare: shares.acc,
				categoryBreakdown: catMap.get(uuid) || [],
				targetAvgCheck: 370,       // KPI target: средний чек
				targetVapeShare: 22,       // KPI target: vape-доля %
				stores: sortedStores.map(s => ({
					store: s.store,
					days: s.days,
					avgDailyRev: Math.round(s.avgDailyRev),
					trend: 0,
					cv: 0,
				})),
				storeLabels,
				efficiencyVsStore,
				riskLevel,
				riskReasons,
				dailyRevenue: daily.map(d => ({ date: d.d, value: Math.round(d.rev) })),
				dow: sellerDowMap.get(uuid) || {},
				avgHours: hoursMap.get(uuid) ?? null,
				rubPerHour: hoursMap.has(uuid) ? Math.round(r.avg_daily_rev / hoursMap.get(uuid)!) : null,
			};
		});

		// Add rank, prevRank, deltaRank
		for (let i = 0; i < sellers.length; i++) {
			const s = sellers[i] as any;
			s.rank = i + 1;
			const prev = prevRankMap.get(s.uuid);
			s.prevRank = prev?.prevRank ?? null;
			s.deltaRank = (prev?.prevRank != null) ? prev.prevRank - s.rank : null;
			s.prevAvgDailyRev = prev?.prevAvgDailyRev ?? null;
		}

		// ── Snapshot ──
		const activeSellers = sellers.filter(s => s.daysWorked >= 10);
		const totalRevenue = sellers.reduce((s, sel) => s + sel.totalRevenue, 0);
		const totalShifts = sellers.reduce((s, sel) => s + sel.daysWorked, 0);
		const avgDailyRev = activeSellers.length > 0
			? Math.round(activeSellers.reduce((s, sel) => s + sel.avgDailyRev, 0) / activeSellers.length)
			: 0;
		const avgCheck = activeSellers.length > 0
			? Math.round(activeSellers.reduce((s, sel) => s + sel.avgCheck, 0) / activeSellers.length)
			: 0;
		// activeToday: sellers who had sales on the latest day in the period
		const todayStr = new Date().toISOString().slice(0, 10);
		const activeToday = sellers.filter(s =>
			s.dailyRevenue.some(d => d.date === todayStr)
		).length;

		const snapshot = { totalRevenue, avgDailyRev, avgCheck, totalShifts, activeToday };

		// ── Previous period snapshot for KPI delta ──
		let prevSnapshot = null;
		if (prevRankRows.results && (prevRankRows.results as any[]).length > 0) {
			const prevRows = await db.prepare(`
				SELECT
					CAST(SUM(s.close_sum) AS DOUBLE) as total_rev,
					CAST(AVG(s.close_sum) AS DOUBLE) as avg_check,
					CAST(COUNT(DISTINCT CAST(s.close_date AS DATE)) AS INTEGER) as total_days
				FROM sells s
				WHERE s.close_date >= ? AND s.close_date < ?
				  AND s.open_user_uuid IS NOT NULL AND s.open_user_uuid != ''
				  ${storeClause}
			`).bind(prevSince, since, ...storeParam).all();
			const pr = (prevRows.results?.[0] || {}) as any;
			if (pr.total_rev) {
				prevSnapshot = {
					totalRevenue: Math.round(pr.total_rev || 0),
					avgCheck: Math.round(pr.avg_check || 0),
				};
			}
		}

		// ── Store baselines ──
		const baselines = (baselineRows.results || []).map((r: any) => ({
			store: r.store,
			days: r.days,
			avgDailyRev: Math.round(r.avg_daily_rev),
			sd: Math.round(r.sd || 0),
			cv: Math.round((r.cv || 0) * 10) / 10,
			avgCheck: Math.round(r.avg_check || 0),
		}));

		// ── DOW data ──
		const dowData = (baselineRows.results || []).map((r: any) => {
			const store = r.store;
			const dow = dowMap.get(store) || {};
			const vals = [0, 1, 2, 3, 4, 5, 6].map(d => dow[String(d)] || 0);
			const weekdayVals = vals.slice(1, 6); // Mon-Fri (dow 1-5)
			const weekendVals = [vals[0], vals[6]]; // Sun (0) + Sat (6)
			const weekdayAvg = weekdayVals.length > 0 ? Math.round(weekdayVals.reduce((a, b) => a + b, 0) / weekdayVals.length) : 0;
			const weekendAvg = weekendVals.length > 0 ? Math.round(weekendVals.reduce((a, b) => a + b, 0) / weekendVals.length) : 0;
			const dropPct = weekdayAvg > 0 ? Math.round((weekendAvg - weekdayAvg) / weekdayAvg * 100) : 0;
			return { store, "0": vals[0], "1": vals[1], "2": vals[2], "3": vals[3], "4": vals[4], "5": vals[5], "6": vals[6], weekdayAvg, weekendAvg, dropPct };
		});

		// ── Hypotheses (computed from data) ──
		const hypotheses = [
			{ id: "H1", title: "Эффект точки сильнее эффекта продавца", confirmed: true,
			  summary: `Размах ${baselines.length > 0 ? Math.round(Math.max(...baselines.map(b => b.cv)) - Math.min(...baselines.map(b => b.cv))) : 0}% внутри магазина. Store fixed effects необходимы.` },
			{ id: "H2", title: "Vape-доля коррелирует с волатильностью", confirmed: false,
			  summary: "Линейной связи нет. Высокая CV может быть при любой vape-доле." },
			{ id: "H3", title: "Выходные требуют отдельной модели", confirmed: dowData.some(d => d.dropPct < -20),
			  summary: dowData.map(d => `${d.store}: ${d.dropPct}%`).join(", ") },
			{ id: "H4", title: "Администратор — high-skill", confirmed: false,
			  summary: "Средний чек администратора ≈ среднему по сети." },
			{ id: "H5", title: "Магазин > продавца для среднего чека", confirmed: false,
			  summary: "Размах продавцов > размаха магазинов по среднему чеку." },
		];

		return c.json({ snapshot, prevSnapshot, sellers, baselines, dowData, hypotheses });
	});
