import type { AiInsightsData } from "../../types";
import type { AppDB } from "../../db-duckdb.js";

function generateCacheKey(shopUuid: string, startDate: string, endDate: string): string {
	return `ai_insights:${shopUuid}:${startDate}:${endDate}`;
}

export async function getAiInsightsFromCache(
	db: AppDB, shopUuid: string, startDate: string, endDate: string,
): Promise<AiInsightsData | null> {
	const cacheKey = generateCacheKey(shopUuid, startDate, endDate);
	const now = Math.floor(Date.now() / 1000);
	const cached = await db.prepare("SELECT * FROM ai_insights_cache WHERE cache_key = ?").bind(cacheKey).first();
	if (!cached) return null;
	if (cached.expires_at < now) {
		await db.prepare("DELETE FROM ai_insights_cache WHERE cache_key = ?").bind(cacheKey).run();
		return null;
	}
	const parsed = JSON.parse(cached.data_json);
	return {
		insights: parsed.insights || [],
		anomalies: parsed.anomalies || [],
		patterns: parsed.patterns || [],
		documentsCount: parsed.documentsCount || 0,
	};
}

export async function saveAiInsightsToCache(
	db: AppDB, shopUuid: string, startDate: string, endDate: string, data: AiInsightsData,
): Promise<void> {
	const cacheKey = generateCacheKey(shopUuid, startDate, endDate);
	const now = Math.floor(Date.now() / 1000);
	const expiresAt = now + 3600;
	await db.prepare("DELETE FROM ai_insights_cache WHERE cache_key = ?").bind(cacheKey).run();
	await db.prepare("INSERT INTO ai_insights_cache (cache_key, data_json, created_at, expires_at) VALUES (?, ?, ?, ?)")
		.bind(cacheKey, JSON.stringify(data), now, expiresAt).run();
}

export async function cleanupExpiredCache(db: AppDB): Promise<number> {
	const now = Math.floor(Date.now() / 1000);
	const result = await db.prepare("DELETE FROM ai_insights_cache WHERE expires_at < ?").bind(now).run();
	return result.meta.changes || 0;
}

export async function invalidateAiInsightsCache(db: AppDB, shopUuid: string, startDate: string, endDate: string): Promise<void> {
	const cacheKey = generateCacheKey(shopUuid, startDate, endDate);
	await db.prepare("DELETE FROM ai_insights_cache WHERE cache_key = ?").bind(cacheKey).run();
}

export async function clearAllAiInsightsCache(db: AppDB): Promise<number> {
	const result = await db.prepare("DELETE FROM ai_insights_cache").run();
	return result.meta.changes || 0;
}
