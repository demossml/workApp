import type { D1Adapter } from "../../db-duckdb";

export const API_LATENCY_METRIC_KEY = "api_latency_ms";

function toMinuteBucket(timestampMs: number) {
  return Math.floor(timestampMs / 60000) * 60000;
}

export async function saveApiLatencyMetric(
  db: D1Adapter,
  latencyMs: number,
  timestampMs = Date.now(),
) {
  await db.prepare(`
    INSERT INTO metrics_minute (minute_ts, metric_key, shop_uuid, value)
    VALUES (?, ?, ?, ?)
  `).bind(
    toMinuteBucket(timestampMs),
    API_LATENCY_METRIC_KEY,
    null,
    latencyMs,
  ).run();
}

export async function getApiLatencyValuesByPeriod(
  db: D1Adapter,
  sinceTs: number,
  untilTs: number,
) {
  const sinceMinute = toMinuteBucket(sinceTs);
  const untilMinute = toMinuteBucket(untilTs);
  return db.prepare(`
    SELECT value FROM metrics_minute
    WHERE metric_key = ?
      AND minute_ts >= ?
      AND minute_ts <= ?
  `).bind(API_LATENCY_METRIC_KEY, sinceMinute, untilMinute).all();
}
