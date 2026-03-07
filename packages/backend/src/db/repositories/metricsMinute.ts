import { and, eq, gte, lte } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { metricsMinute } from "../schema/metricsMinute";

export const API_LATENCY_METRIC_KEY = "api_latency_ms";

function toMinuteBucket(timestampMs: number) {
	return Math.floor(timestampMs / 60000) * 60000;
}

export async function saveApiLatencyMetric(
	db: DrizzleD1Database<Record<string, unknown>>,
	latencyMs: number,
	timestampMs = Date.now(),
) {
	await db
		.insert(metricsMinute)
		.values({
			minuteTs: toMinuteBucket(timestampMs),
			metricKey: API_LATENCY_METRIC_KEY,
			shopUuid: null,
			value: latencyMs,
		})
		.run();
}

export async function getApiLatencyValuesByPeriod(
	db: DrizzleD1Database<Record<string, unknown>>,
	sinceTs: number,
	untilTs: number,
) {
	const sinceMinute = toMinuteBucket(sinceTs);
	const untilMinute = toMinuteBucket(untilTs);

	return db
		.select({ value: metricsMinute.value })
		.from(metricsMinute)
		.where(
			and(
				eq(metricsMinute.metricKey, API_LATENCY_METRIC_KEY),
				gte(metricsMinute.minuteTs, sinceMinute),
				lte(metricsMinute.minuteTs, untilMinute),
			),
		)
		.all();
}
