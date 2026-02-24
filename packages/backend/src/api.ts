import { Hono } from "hono";
import type { IEnv } from "./types";
import { employeesRoutes } from "./routes/employees";
import { aiRoutes } from "./routes/ai";
import { schedulesRoutes } from "./routes/schedules";
import { uploadsRoutes } from "./routes/uploads";
import { storesRoutes } from "./routes/stores";
import { evotorRoutes } from "./routes/evotor";
import { deadStocksRoutes } from "./routes/deadStocksRoutes";

export const api = new Hono<IEnv>()
	.route("/api/employees", employeesRoutes)
	.route("/api/ai", aiRoutes)
	.route("/api/schedules", schedulesRoutes)
	.route("/api/uploads", uploadsRoutes)
	.route("/api/stores", storesRoutes)
	.route("/api/evotor", evotorRoutes)
	.route("/api/deadStocks", deadStocksRoutes);

export type IAPI = typeof api;
