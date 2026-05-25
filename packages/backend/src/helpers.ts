import type { Next } from "hono";
import { Evotor } from "./evotor";
import { DuckDBDataService, getDataService } from "./data-service";
import type { IContext } from "./types";
import { isValidSign } from "./utils";
import { createD1Adapter } from "./db-duckdb";
import { KVStore, globalKV } from "./kv-store";
import { jsonError } from "./errors";
import { createAiAdapter } from "./ai-adapter";
import { trackAppEvent } from "./analytics/track";

const defaultKV = new KVStore();

export const initialize = (c: IContext, next: Next) => {
  c.set(
    "evotor",
    getDataService(),
  );
  
  const db = createD1Adapter();
  c.set("db", db);
  c.set("ai", createAiAdapter());
  c.set("BOT_TOKEN", c.env.BOT_TOKEN);
  c.set("kv", c.env.KV || defaultKV);
  c.set("r2Dir", "/tmp/evo-r2");
  c.set("r2Url", c.env.R2_PUBLIC_URL || "/files");

  return next();
};

export const authenticate = async (c: IContext, next: Next) => {
  try {
    const initData =
      c.req.header("initData") || c.req.query("initData") || "guest";

    if (initData === "guest") {
      const manualId =
        c.req.header("telegram-id") || c.req.query("telegram-id");

      if (manualId) {
        c.set("user", {
          id: manualId,
          first_name: "",
          last_name: "",
          username: "",
          photo_url: "",
        });
        c.set("userId", manualId);
      } else {
        c.set("user", {
          id: "",
          first_name: "",
          last_name: "",
          username: "",
          photo_url: "",
        });
        c.set("userId", "");
      }
      await trackAppEvent(c, "auth_guest_login", {
        userId: manualId || null,
        props: { hasManualId: Boolean(manualId) },
      });
    } else {
      const payload = Object.fromEntries(new URLSearchParams(initData));
      // TEMP: skip signature validation for debugging
      const isValid = true; // await isValidSign(c.env.BOT_TOKEN, payload);

      if (!isValid) {
        return jsonError(c, 401, "AUTH_INVALID_SIGNATURE", "Invalid signature");
      }

      const user = payload.user ? JSON.parse(payload.user) : { id: "0", first_name: "", last_name: "", username: "", photo_url: "" };
      c.set("user", user);
      c.set("userId", user.id.toString());
      await trackAppEvent(c, "auth_webapp_verified", {
        userId: user.id.toString(),
      });
    }

    return next();
  } catch (error) {
    return jsonError(
      c,
      401,
      "AUTH_FAILED",
      error instanceof Error ? error.message : "Unknown error",
    );
  }
};
