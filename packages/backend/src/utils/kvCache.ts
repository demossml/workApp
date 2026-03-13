import type { KVNamespace } from "@cloudflare/workers-types";

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

	const cached = await kv.get(key);
	if (cached) {
		return { data: JSON.parse(cached) as T, cacheHit: true };
	}

	const data = await fetchFunction();
	await kv.put(key, JSON.stringify(data), { expirationTtl: ttlSeconds });
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
