import { Hono } from "hono";
import { cors } from "hono/cors";
import { api } from "./api";
import { authenticate, initialize } from "./helpers";
import { errorHandler, requestLogger } from "./middleware";
import type { IEnv } from "./types";
import { healthRoutes } from "./routes/health";

const app = new Hono<IEnv>()
	.use("/*", cors())
	.use("/*", requestLogger())
	.use("/*", initialize)
	.get("/", (c) => c.json({ message: "Welcome to Evo backend" }))
	.route("/api", healthRoutes)
	.use("/*", authenticate)
	.route("/", api)
	.onError(errorHandler);

export default app;
export * from "./api";
