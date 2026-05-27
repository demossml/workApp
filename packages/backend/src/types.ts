import type { Context } from "hono";
import type { Evotor } from "./evotor";
import type { D1Adapter } from "./db-duckdb";
import type { KVStore } from "./kv-store";

export type IEnv = {
  Bindings: {
    DB: D1Adapter;
    BOT_TOKEN: string;
    EVOTOR_API_TOKEN: string;
    R2_PUBLIC_URL: string;
    R2?: any;
    KV?: KVStore;
    AI_KV?: KVStore;
    ANTHROPIC_API_KEY?: string;
    AI?: any; // Cloudflare AI stub
    WEATHER_DEFAULT_LAT?: string;
    WEATHER_DEFAULT_LON?: string;
    WEATHER_DEFAULT_NAME?: string;
    R2_ACCOUNT_ID?: string;
    ALERT_TZ_OFFSET_MINUTES?: string;
    ALERT_REFUND_THRESHOLD_PCT?: string;
    ALERT_REVENUE_DROP_THRESHOLD_PCT?: string;
    ALERT_THRESHOLD_PCT?: string;
    AI_MODEL?: string;
    AI_MAX_TOKENS?: string;
    ONEC_API_KEY?: string;
    CRON_TOKEN?: string;
    EVOTOR_PROXY_URL?: string;
    DISABLE_EVOTOR_CRON?: string;
    DISABLE_AI_DIRECTOR?: string;
    ENV?: string;
  };
  Variables: {
    userId: string;
    shopId: string;
    user: {
      id: string;
      first_name: string;
      last_name: string;
      username: string;
      photo_url: string;
    };
    evotor: any; // Evotor | DuckDBDataService
    db: D1Adapter;
    ai?: any;
    BOT_TOKEN: string;
    kv?: KVStore;
    r2Dir?: string;
    r2Url: string;
    settingsDb?: D1Adapter;
  };
};

export type IContext = Context<IEnv>;

export interface DeadStockItem {
  name: string;
  quantity: number;
  sold: number;
  lastSaleDate: string | null;
  mark?: "keep" | "move" | "sellout" | "writeoff" | null;
  moveCount?: number;
  moveToStore?: string;
}

export interface SaveDeadStocksRequest {
  shopUuid: string;
  items: DeadStockItem[];
}

export interface AiInsightsData {
  insights: Array<{
    priority: "high" | "medium" | "low";
    action: string;
    reason: string;
    expectedResult: string;
  }>;
  anomalies: Array<{
    type: string;
    reason: string;
    details?: string;
    priority: "high" | "medium" | "low";
  }>;
  patterns: Array<{
    category: "product" | "time" | "employee" | "trend" | "other";
    pattern: string;
    data: string;
    recommendation?: string;
  }>;
  documentsCount?: number;
}
