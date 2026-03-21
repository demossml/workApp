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

const app = new Hono<IEnv>()
	.use("/*", cors())
	.use("/*", requestLogger())
	.use("/*", initialize)
	.get("/", (c) => c.json({ message: "Welcome to Evo backend" }))
	.route("/api", healthRoutes)
	.use("/*", authenticate)
	.route("/", api)
	.onError(errorHandler);

export default {
	fetch: app.fetch,
	scheduled: async (event: ScheduledEvent, env: IEnv["Bindings"]) => {
		if (event.cron === "*/3 * * * *") {
			await getDocuments(env);

			const nowUtc = new Date();
			const nowUtcMs = nowUtc.getTime();
			const localNow = toLocalTime(
				nowUtc,
				parseTzOffsetMinutes(env.ALERT_TZ_OFFSET_MINUTES),
			);

			// Аналог EvoTrack: updateProductsShope ~ каждые 5 минут.
			if (await shouldRunIntervalJob(env, "update-products-shope", 5, nowUtcMs)) {
				try {
					await updateProductsShope(env);
				} catch (error) {
					logger.error("Scheduled updateProductsShope failed", { error });
				}
			}

			// Аналог EvoTrack: updateProducts ~ каждые 25 минут.
			if (await shouldRunIntervalJob(env, "update-products", 25, nowUtcMs)) {
				try {
					await updateProducts(env);
				} catch (error) {
					logger.error("Scheduled updateProducts failed", { error });
				}
			}

			// Аналог EvoTrack: getDataForCurrentDate ежедневно около 06:35 (МСК).
			const isSalaryWindow =
				localNow.getUTCHours() === 6 && localNow.getUTCMinutes() >= 35;
			if (
				isSalaryWindow &&
				(await shouldRunDailyJob(
					env,
					"salary-sync",
					getLocalDateKey(localNow),
				))
			) {
				try {
					await getDataForCurrentDate(env);
				} catch (error) {
					logger.error("Scheduled getDataForCurrentDate failed", { error });
				}
			}

			// Ежедневный запуск в 06:00 UTC (09:00 MSK) в рамках 3-минутного cron.
			if (nowUtc.getUTCHours() === 6 && nowUtc.getUTCMinutes() === 0) {
				await runDailyTelegramDigestAndAlerts(env);
			}
			return;
		}

		if (event.cron === "0 8 * * *" || event.cron === "0 11 * * *") {
			await runTempoAlerts(env);
			return;
		}

		logger.warn("Unhandled scheduled cron expression", { cron: event.cron });
	},
};
export * from "./api";
