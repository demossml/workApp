import { eq, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { aiInsightsCache } from "../schema/aiInsightsCache";
import type { AiInsightsData } from "../../types";

/**
 * Генерирует ключ кэша на основе параметров запроса
 */
function generateCacheKey(
	shopUuid: string,
	startDate: string,
	endDate: string,
): string {
	return `ai_insights:${shopUuid}:${startDate}:${endDate}`;
}

/**
 * Получает кэшированные AI insights, если они существуют и не истекли
 */
export async function getAiInsightsFromCache(
	db: DrizzleD1Database<Record<string, unknown>>,
	shopUuid: string,
	startDate: string,
	endDate: string,
): Promise<AiInsightsData | null> {
	const cacheKey = generateCacheKey(shopUuid, startDate, endDate);
	const now = Math.floor(Date.now() / 1000);

	const cached = await db
		.select()
		.from(aiInsightsCache)
		.where(eq(aiInsightsCache.cacheKey, cacheKey))
		.get();

	if (!cached) {
		return null;
	}

	// Проверяем, не истек ли кэш
	if (cached.expiresAt < now) {
		// Кэш истек, удаляем запись
		await db
			.delete(aiInsightsCache)
			.where(eq(aiInsightsCache.cacheKey, cacheKey))
			.run();
		return null;
	}

	// Возвращаем кэшированные данные
	return {
		insights: JSON.parse(cached.insights),
		anomalies: JSON.parse(cached.anomalies),
		patterns: JSON.parse(cached.patterns),
		documentsCount: cached.documentsCount,
	};
}

/**
 * Сохраняет результаты AI анализа в кэш
 * TTL: 1 час
 */
export async function saveAiInsightsToCache(
	db: DrizzleD1Database<Record<string, unknown>>,
	shopUuid: string,
	startDate: string,
	endDate: string,
	data: AiInsightsData,
): Promise<void> {
	const cacheKey = generateCacheKey(shopUuid, startDate, endDate);
	const now = Math.floor(Date.now() / 1000);
	const ttl = 3600; // 1 час в секундах
	const expiresAt = now + ttl;

	// Удаляем старую запись, если существует
	await db
		.delete(aiInsightsCache)
		.where(eq(aiInsightsCache.cacheKey, cacheKey))
		.run();

	// Вставляем новую запись
	await db
		.insert(aiInsightsCache)
		.values({
			cacheKey,
			shopUuid,
			startDate,
			endDate,
			insights: JSON.stringify(data.insights),
			anomalies: JSON.stringify(data.anomalies),
			patterns: JSON.stringify(data.patterns),
			documentsCount: data.documentsCount || 0,
			expiresAt,
		})
		.run();
}

/**
 * Очищает истекшие записи кэша
 * Рекомендуется вызывать периодически (например, раз в день)
 */
export async function cleanupExpiredCache(
	db: DrizzleD1Database<Record<string, unknown>>,
): Promise<number> {
	const now = Math.floor(Date.now() / 1000);

	const result = await db
		.delete(aiInsightsCache)
		.where(sql`${aiInsightsCache.expiresAt} < ${now}`)
		.run();

	return result.meta.changes || 0;
}

/**
 * Инвалидирует кэш для конкретного магазина и периода
 */
export async function invalidateAiInsightsCache(
	db: DrizzleD1Database<Record<string, unknown>>,
	shopUuid: string,
	startDate: string,
	endDate: string,
): Promise<void> {
	const cacheKey = generateCacheKey(shopUuid, startDate, endDate);

	await db
		.delete(aiInsightsCache)
		.where(eq(aiInsightsCache.cacheKey, cacheKey))
		.run();
}

/**
 * Очищает весь кэш AI insights
 */
export async function clearAllAiInsightsCache(
	db: DrizzleD1Database<Record<string, unknown>>,
): Promise<number> {
	const result = await db.delete(aiInsightsCache).run();
	return result.meta.changes || 0;
}
