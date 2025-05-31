import { Hono } from "hono";
import { cors } from "hono/cors";
import { api } from "./api";
import { authenticate, initialize } from "./helpers";
import { IEnv } from "./types";

const app = new Hono<IEnv>()
	.use("/*", cors())
	.use("/*", initialize)
	.get("/", (c) => c.json({ message: "Welcome to Evo backend" }))
	.use("/*", authenticate)
	.route("/", api);

export default app;
export * from "./api";
