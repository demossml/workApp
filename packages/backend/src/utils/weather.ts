import type { KVNamespace } from "@cloudflare/workers-types";
import { buildWeatherKey } from "./kvCache";

export type WeatherSummary = {
	date: string;
	avgTemp: number;
	minTemp: number;
	maxTemp: number;
	precipSum: number;
	timezone: string;
};

type OpenMeteoHourlyResponse = {
	hourly?: {
		time?: string[];
		temperature_2m?: number[];
		precipitation?: number[];
	};
	timezone?: string;
};

const clamp = (value: number, min: number, max: number) =>
	Math.max(min, Math.min(max, value));

export async function getWeatherSummary(
	lat: number,
	lon: number,
	date: string,
	kv?: KVNamespace,
): Promise<WeatherSummary | null> {
	const key = buildWeatherKey(lat, lon, date);
	if (kv) {
		try {
			const cached = await kv.get(key);
			if (cached) return JSON.parse(cached) as WeatherSummary;
		} catch {
			// If KV fails (limits, transient), continue without cache.
		}
	}

	const url = new URL("https://api.open-meteo.com/v1/forecast");
	url.searchParams.set("latitude", String(lat));
	url.searchParams.set("longitude", String(lon));
	url.searchParams.set("hourly", "temperature_2m,precipitation");
	url.searchParams.set("start_date", date);
	url.searchParams.set("end_date", date);
	url.searchParams.set("timezone", "auto");

	const res = await fetch(url.toString());
	if (!res.ok) return null;
	const data = (await res.json()) as OpenMeteoHourlyResponse;
	const hourly = data.hourly;
	if (!hourly || !hourly.time || !hourly.temperature_2m || !hourly.precipitation) {
		return null;
	}

	const temps = hourly.temperature_2m;
	const prec = hourly.precipitation;
	if (temps.length === 0) return null;

	const avgTemp = temps.reduce((sum, t) => sum + t, 0) / temps.length;
	const minTemp = temps.reduce((min, t) => Math.min(min, t), temps[0]);
	const maxTemp = temps.reduce((max, t) => Math.max(max, t), temps[0]);
	const precipSum = prec.reduce((sum, p) => sum + p, 0);

	const summary: WeatherSummary = {
		date,
		avgTemp: Number(avgTemp.toFixed(2)),
		minTemp: Number(minTemp.toFixed(2)),
		maxTemp: Number(maxTemp.toFixed(2)),
		precipSum: Number(precipSum.toFixed(2)),
		timezone: data.timezone || "auto",
	};

	if (kv) {
		try {
			await kv.put(key, JSON.stringify(summary), { expirationTtl: 60 * 60 });
		} catch {
			// Ignore KV write failures (limits, transient).
		}
	}

	return summary;
}

export function weatherDemandFactor(summary: WeatherSummary | null): number {
	if (!summary) return 1;
	let factor = 1;
	if (summary.precipSum >= 5) factor *= 0.9;
	if (summary.minTemp <= -10 || summary.maxTemp >= 30) factor *= 0.9;
	return clamp(factor, 0.7, 1.1);
}
