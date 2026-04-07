import { Hono } from "hono";
import { cors } from "hono/cors";
import { api } from "./api";
import { authenticate, initialize } from "./helpers";
import { errorHandler, requestLogger } from "./middleware";
import type { IEnv } from "./types";
import { healthRoutes } from "./routes/health";
import { runDailyTelegramDigestAndAlerts } from "./telegram/digestAndAlerts";
import type { ScheduledEvent } from "@cloudflare/workers-types";
import { logger } from "./logger";
import { runTempoAlerts } from "./telegram/tempoAlerts";
import {
	getDataForCurrentDate,
	getDocuments,
	updateProducts,
	updateProductsShope,
} from "./jobs/evotrackIndexing";

const JOBS_KV_PREFIX = "jobs:evotrack:";

function isFlagEnabled(value?: string): boolean {
	if (!value) return false;
	const normalized = value.trim().toLowerCase();
	return normalized === "1" || normalized === "true" || normalized === "yes";
}

function parseTzOffsetMinutes(value?: string): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 180;
}

function toLocalTime(nowUtc: Date, tzOffsetMinutes: number): Date {
	return new Date(nowUtc.getTime() + tzOffsetMinutes * 60_000);
}

function getLocalDateKey(localDate: Date): string {
	return localDate.toISOString().slice(0, 10);
}

function isCronTokenValid(env: IEnv["Bindings"], token: string | undefined): boolean {
	if (!env.CRON_TOKEN) return false;
	if (!token) return false;
	return env.CRON_TOKEN === token;
}

async function shouldRunIntervalJob(
	env: IEnv["Bindings"],
	jobKey: string,
	intervalMinutes: number,
	nowUtcMs: number,
): Promise<boolean> {
	if (!env.KV) return false;

	const kvKey = `${JOBS_KV_PREFIX}${jobKey}:last`;
	const lastRaw = await env.KV.get(kvKey);
	const lastRunMs = Number(lastRaw || 0);
	const intervalMs = intervalMinutes * 60_000;

	if (!Number.isFinite(lastRunMs) || nowUtcMs - lastRunMs >= intervalMs) {
		await env.KV.put(kvKey, String(nowUtcMs), { expirationTtl: 172_800 });
		return true;
	}

	return false;
}

async function shouldRunDailyJob(
	env: IEnv["Bindings"],
	jobKey: string,
	localDateKey: string,
): Promise<boolean> {
	if (!env.KV) return false;

	const kvKey = `${JOBS_KV_PREFIX}${jobKey}:date`;
	const lastDate = await env.KV.get(kvKey);

	if (lastDate !== localDateKey) {
		await env.KV.put(kvKey, localDateKey, { expirationTtl: 172_800 });
		return true;
	}

	return false;
}

async function runDailyDbRetention(
	env: IEnv["Bindings"],
): Promise<void> {
	try {
		const appEventsResult = await env.DB
			.prepare("DELETE FROM app_events WHERE ts < datetime('now', '-14 day')")
			.run();
		const metricsResult = await env.DB
			.prepare(
				"DELETE FROM metrics_minute WHERE minute_ts < (strftime('%s','now') - 7*24*60*60) * 1000",
			)
			.run();

		logger.info("Daily D1 retention completed", {
			appEventsDeleted: Number(appEventsResult.meta?.changes || 0),
			metricsDeleted: Number(metricsResult.meta?.changes || 0),
		});
	} catch (error) {
		logger.error("Daily D1 retention failed", { error });
	}
}

async function runScheduledByCron(
	cron: string,
	env: IEnv["Bindings"],
): Promise<boolean> {
	if (cron === "*/3 * * * *" || cron === "*/15 * * * *") {
		const evotorCronDisabled = isFlagEnabled(env.DISABLE_EVOTOR_CRON);

		const nowUtc = new Date();
		const nowUtcMs = nowUtc.getTime();
		const localNow = toLocalTime(
			nowUtc,
			parseTzOffsetMinutes(env.ALERT_TZ_OFFSET_MINUTES),
		);
		const localDateKey = getLocalDateKey(localNow);

		if (await shouldRunDailyJob(env, "d1-retention", localDateKey)) {
			await runDailyDbRetention(env);
		}

		if (evotorCronDisabled) {
			logger.warn("Scheduled Evotor cron tasks are disabled by env flag", {
				flag: "DISABLE_EVOTOR_CRON",
				cron,
			});
			return true;
		}

		await getDocuments(env);

		if (await shouldRunIntervalJob(env, "update-products-shope", 5, nowUtcMs)) {
			try {
				await updateProductsShope(env);
			} catch (error) {
				logger.error("Scheduled updateProductsShope failed", { error });
			}
		}

		if (await shouldRunIntervalJob(env, "update-products", 25, nowUtcMs)) {
			try {
				await updateProducts(env);
			} catch (error) {
				logger.error("Scheduled updateProducts failed", { error });
			}
		}

		const isSalaryWindow =
			localNow.getUTCHours() === 6 && localNow.getUTCMinutes() >= 35;
		if (
			isSalaryWindow &&
			(await shouldRunDailyJob(
				env,
				"salary-sync",
				localDateKey,
			))
		) {
			try {
				await getDataForCurrentDate(env);
			} catch (error) {
				logger.error("Scheduled getDataForCurrentDate failed", { error });
			}
		}

		if (nowUtc.getUTCHours() === 6 && nowUtc.getUTCMinutes() === 0) {
			await runDailyTelegramDigestAndAlerts(env);
		}
		return true;
	}

	if (cron === "0 8 * * *" || cron === "0 11 * * *") {
		if (isFlagEnabled(env.DISABLE_EVOTOR_CRON)) {
			logger.warn("Scheduled Evotor cron tasks are disabled by env flag", {
				flag: "DISABLE_EVOTOR_CRON",
				cron,
			});
			return true;
		}
		await runTempoAlerts(env);
		return true;
	}

	return false;
}

const app = new Hono<IEnv>()
	.use("/*", cors())
	.use("/*", initialize)
	.use("/*", requestLogger())
	.get("/", (c) => c.json({ message: "Welcome to Evo backend" }))
	.post("/internal/cron/run", async (c) => {
		const token = c.req.header("x-cron-token");
		if (!isCronTokenValid(c.env, token)) {
			return c.json({ ok: false, error: "CRON_TOKEN_INVALID" }, 401);
		}

		const body = await c.req.json().catch(() => ({}));
		const cron = typeof body?.cron === "string" ? body.cron : "";
		if (!cron) {
			return c.json({ ok: false, error: "CRON_REQUIRED" }, 400);
		}

		const handled = await runScheduledByCron(cron, c.env);
		if (!handled) {
			logger.warn("Unhandled scheduled cron expression", { cron });
		}

		return c.json({ ok: true, handled, cron });
	})
	.route("/api", healthRoutes)
	.use("/*", authenticate)
	.route("/", api)
	.onError(errorHandler);

export default {
	fetch: app.fetch,
	scheduled: async (event: ScheduledEvent, env: IEnv["Bindings"]) => {
		const handled = await runScheduledByCron(event.cron, env);
		if (handled) {
			return;
		}

		logger.warn("Unhandled scheduled cron expression", { cron: event.cron });
	},
};
export * from "./api";
