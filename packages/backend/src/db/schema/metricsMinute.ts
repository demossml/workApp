import { index, integer, real, text } from "drizzle-orm/sqlite-core";
import { sqliteTable } from "./_table";

export const metricsMinute = sqliteTable(
	"metrics_minute",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		minuteTs: integer("minute_ts").notNull(),
		metricKey: text("metric_key").notNull(),
		shopUuid: text("shop_uuid"),
		value: real("value").notNull(),
	},
	(table) => ({
		minuteTsIdx: index("metrics_minute_ts_idx").on(table.minuteTs),
		metricKeyIdx: index("metrics_minute_metric_key_idx").on(table.metricKey),
		shopUuidIdx: index("metrics_minute_shop_uuid_idx").on(table.shopUuid),
	}),
);

export type MetricsMinuteInsert = typeof metricsMinute.$inferInsert;
export type MetricsMinuteSelect = typeof metricsMinute.$inferSelect;
