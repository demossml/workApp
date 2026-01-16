import { text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { sqliteTable } from "./_table";

/**
 * Таблица для кэширования AI insights
 * TTL: 1 час (результаты актуальны в течение часа для одного периода)
 */
export const aiInsightsCache = sqliteTable("ai_insights_cache", {
	id: integer("id").primaryKey({ autoIncrement: true }),

	// Ключ кэша (hash от параметров запроса)
	cacheKey: text("cache_key").notNull().unique(),

	// Параметры запроса
	shopUuid: text("shop_uuid").notNull(),
	startDate: text("start_date").notNull(),
	endDate: text("end_date").notNull(),

	// Результаты AI анализа (JSON)
	insights: text("insights").notNull(), // JSON массив
	anomalies: text("anomalies").notNull(), // JSON массив
	patterns: text("patterns").notNull(), // JSON массив
	documentsCount: integer("documents_count").notNull(),

	// Метаданные
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
	expiresAt: integer("expires_at").notNull(),
});

export type AiInsightsCacheInsert = typeof aiInsightsCache.$inferInsert;
export type AiInsightsCacheSelect = typeof aiInsightsCache.$inferSelect;
