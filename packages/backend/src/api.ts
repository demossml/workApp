import { Hono } from "hono";
import type { IEnv } from "./types";
import { employeesRoutes } from "./routes/employees";
import { aiRoutes } from "./routes/ai";
import { schedulesRoutes } from "./routes/schedules";
import { uploadsRoutes } from "./routes/uploads";
import { storesRoutes } from "./routes/stores";
import { evotorRoutes } from "./routes/evotor";
import { deadStocksRoutes } from "./routes/deadStocksRoutes";
import { analyticsRoutes } from "./routes/analytics";
import { telegramRoutes } from "./routes/telegram";
import { onecRoutes } from "./routes/onec";
import { eventsRoutes } from "./routes/events";

export const api = new Hono<IEnv>()
	.route("/api/employees", employeesRoutes)
	.route("/api/ai", aiRoutes)
	.route("/api/schedules", schedulesRoutes)
	.route("/api/uploads", uploadsRoutes)
	.route("/api/stores", storesRoutes)
	.route("/api/evotor", evotorRoutes)
	.route("/api/deadStocks", deadStocksRoutes)
	.route("/api/analytics", analyticsRoutes)
	.route("/api/telegram", telegramRoutes)
	.route("/api/events", eventsRoutes)
	.route("/api/1c", onecRoutes);

export type IAPI = typeof api;
