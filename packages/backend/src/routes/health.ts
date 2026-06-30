import { Hono } from "hono";
import type { IEnv } from "../types";
import { getMonitoringSnapshot } from "../monitoring";

export const healthRoutes = new Hono<IEnv>()
	.get("/health", async (c) => {
		const dbStart = Date.now();
		let dbOk = false;
		let dbError: string | undefined;

		try {
			await c.env.DB.prepare("SELECT 1 as ok").first();
			dbOk = true;
		} catch (error) {
			dbError = error instanceof Error ? error.message : "DB ping failed";
		}

		const dbLatencyMs = Date.now() - dbStart;
		const metrics = getMonitoringSnapshot();
		const status = dbOk ? "ok" : "degraded";

		return c.json({
			status,
			timestamp: new Date().toISOString(),
			uptimeSec: metrics.uptimeSec,
			checks: {
				database: {
					ok: dbOk,
					latencyMs: dbLatencyMs,
					...(dbError ? { error: dbError } : {}),
				},
			},
			metrics: {
				totalRequests: metrics.totalRequests,
				totalErrors: metrics.totalErrors,
				errorRate: metrics.errorRate,
				avgLatencyMs: metrics.avgLatencyMs,
			},
		});
	})
	.get("/health/metrics", (c) => {
		return c.json(getMonitoringSnapshot());
	})
	.get("/health/db-check", async (c) => {
		const results: Record<string, any> = {};
		try {
			const r = await c.env.DB.prepare("SELECT COUNT(*)::INTEGER as cnt FROM sells").first();
			results.sells = r;
		} catch (e: any) {
			results.sells_error = e.message;
		}
		try {
			const r = await c.env.DB.prepare("SELECT COUNT(*)::INTEGER as cnt FROM plan").first();
			results.plan = r;
		} catch (e: any) {
			results.plan_error = e.message;
		}
		try {
			const r = await c.env.DB.prepare("SELECT store_uuid, name FROM stores").all();
			results.stores = r.results;
			results.stores_count = (r.results || []).length;
		} catch (e: any) {
			results.stores_error = e.message;
		}
		try {
			const today = new Date().toISOString().slice(0, 10);
			const r = await c.env.DB.prepare("SELECT store_uuid, SUM(close_sum)::INTEGER as total, COUNT(*)::INTEGER as checks FROM sells WHERE DATE(close_date) = ? GROUP BY store_uuid").bind(today).all();
			results.sales_today = r.results;
			results.sales_today_count = (r.results || []).length;
		} catch (e: any) {
			results.sales_today_error = e.message;
		}
		return c.json(results);
	});
