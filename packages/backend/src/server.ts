const { serve } = require("@hono/node-server");
const { serveStatic } = require("@hono/node-server/serve-static");
const { Hono } = require("hono");
const { cors } = require("hono/cors");
const { api } = require("./api");
const { authenticate, initialize } = require("./helpers");
const { errorHandler, requestLogger } = require("./middleware");
const { healthRoutes } = require("./routes/health");
const { ensureSchema, createD1Adapter } = require("./db-duckdb");
const { KVStore } = require("./kv-store");
const path = require("path");
const fs = require("fs");

const port = parseInt(process.env.PORT || "8787", 10);

const app = new Hono();
const kv = new KVStore();
const dbAdapter = createD1Adapter();

// Inject env bindings
app.use("*", async (c: any, next: any) => {
  c.env = c.env || {};
  c.env.DB = dbAdapter;
  c.env.BOT_TOKEN = process.env.BOT_TOKEN || "";
  c.env.EVOTOR_API_TOKEN = process.env.EVOTOR_API_TOKEN || "";
  c.env.KV = kv;
  c.env.R2_PUBLIC_URL = "/files";
  c.env.DISABLE_EVOTOR_CRON = "1";
  c.env.ALERT_TZ_OFFSET_MINUTES = "180";
  await next();
});

app.use("/*", cors());
app.use("/*", initialize);
app.use("/*", requestLogger());
app.route("/api", healthRoutes);
app.use("/*", authenticate);
app.route("/", api);

const distPath = path.join(__dirname, "..", "dist");
if (fs.existsSync(distPath)) {
  app.use("/*", serveStatic({ root: distPath }));
  app.get("*", serveStatic({ path: "index.html", root: distPath }));
}

app.get("/", (c: any) => c.json({ message: "Evo Backend (workApp)" }));
app.onError(errorHandler);

ensureSchema().catch((err: any) => console.error("Schema init error:", err));

console.log(`Evo Backend (workApp) on port ${port}`);
serve({ fetch: app.fetch, port });
