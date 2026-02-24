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
	});
