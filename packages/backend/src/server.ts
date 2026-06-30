import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { api } from "./api";
import { authenticate, initialize } from "./helpers";
import { errorHandler, requestLogger } from "./middleware";
import { healthRoutes } from "./routes/health";
import { ensureSchema, createD1Adapter } from "./db-duckdb";
import { KVStore } from "./kv-store";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const port = parseInt(process.env.PORT || "8787", 10);

const app = new Hono();
const kv = new KVStore();
const dbAdapter = createD1Adapter();

// Inject env bindings
app.use("*", async (c: any, next: any) => {
  c.env = c.env || {};
  c.env.DB = dbAdapter;
  c.env.BOT_TOKEN = process.env.BOT_TOKEN || "8728251901:AAH7V9qRUBIV7Hv9rMzwnAz29cgdZmmCsyo";
  c.env.EVOTOR_API_TOKEN = process.env.EVOTOR_API_TOKEN || "";
  c.env.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
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
  // SPA fallback — but NOT for asset files (prevent HTML served as JS/CSS)
  app.get("*", (c) => {
    const assetExts = /\.(js|css|svg|png|jpg|jpeg|webp|woff2?|ico|json|map)$/i;
    if (assetExts.test(c.req.path)) {
      return c.notFound();
    }
    return serveStatic({ path: "index.html", root: distPath })(c);
  });
}

app.onError(errorHandler);

ensureSchema().catch((err: any) => console.error("Schema init error:", err));

console.log(`Evo Backend (workApp) on port ${port}`);
serve({ fetch: app.fetch, port });
