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
import { runEvotorDocumentsIndexingJob } from "./jobs/indexEvotorDocuments";

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
		if (event.cron !== "*/3 * * * *") {
			logger.warn("Unhandled scheduled cron expression", { cron: event.cron });
			return;
		}

		await runEvotorDocumentsIndexingJob(env);

		// Ежедневный запуск в 06:00 UTC (09:00 MSK) в рамках 3-минутного cron.
		const nowUtc = new Date();
		if (nowUtc.getUTCHours() === 6 && nowUtc.getUTCMinutes() === 0) {
			await runDailyTelegramDigestAndAlerts(env);
		}
	},
};
export * from "./api";
