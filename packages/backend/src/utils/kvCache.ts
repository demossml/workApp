import type { KVNamespace } from "@cloudflare/workers-types";
import { logger } from "../logger";

export const buildSalesDayKey = (storeId: string, date: string) =>
	`sales:store:${storeId}:day:${date}`;

export const buildSalesHourKey = (storeId: string, date: string) =>
	`sales:store:${storeId}:hour:${date}`;

export const buildTopProductsKey = (storeId: string, period: string) =>
	`products:top:${storeId}:${period}`;

export const buildAiReportKey = (storeId: string, date: string) =>
	`ai:report:${storeId}:${date}`;

export const buildWeatherKey = (lat: number, lon: number, date: string) =>
	`weather:${lat.toFixed(4)}:${lon.toFixed(4)}:${date}`;

export const getCachedJson = async <T>(
	kv: KVNamespace | undefined,
	key: string,
	ttlSeconds: number,
	fetchFunction: () => Promise<T>,
): Promise<{ data: T; cacheHit: boolean }> => {
	if (!kv) {
		return { data: await fetchFunction(), cacheHit: false };
	}

	try {
		const cached = await kv.get(key);
		if (cached) {
			return { data: JSON.parse(cached) as T, cacheHit: true };
		}
	} catch (error) {
		logger.warn("KV get failed, bypassing cache", { key, error });
	}

	const data = await fetchFunction();
	try {
		await kv.put(key, JSON.stringify(data), { expirationTtl: ttlSeconds });
	} catch (error) {
		logger.warn("KV put failed, bypassing cache write", { key, error });
	}
	return { data, cacheHit: false };
};

export const getDateKey = (date: Date) => date.toISOString().slice(0, 10);

export const getTodayAndYesterdayKeys = () => {
	const today = new Date();
	const todayKey = getDateKey(today);
	const yesterday = new Date(today);
	yesterday.setDate(today.getDate() - 1);
	const yesterdayKey = getDateKey(yesterday);
	return { todayKey, yesterdayKey };
};
