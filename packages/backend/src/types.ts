import type { Ai, D1Database, R2Bucket } from "@cloudflare/workers-types";
import type { KVNamespace } from "@cloudflare/workers-types";
import type { Context } from "hono";
import type { Evotor } from "./evotor";

export type IEnv = {
	Bindings: {
		DB: D1Database;
		BOT_TOKEN: string;
		EVOTOR_API_TOKEN: string;
		AI: Ai;
		R2: R2Bucket;
		R2_PUBLIC_URL: string;
		KV?: KVNamespace;
		AI_KV?: KVNamespace;
		ANTHROPIC_API_KEY?: string;
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
		DISABLE_EVOTOR_DOCUMENTS_INDEXING?: string;
		DISABLE_AI_DIRECTOR?: string;
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
		evotor: Evotor;
		db: D1Database;
		ai: Ai;
		r2: R2Bucket;
		r2Url: string;
		BOT_TOKEN: string;
		drizzle: ReturnType<typeof import("drizzle-orm/d1").drizzle>;
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
