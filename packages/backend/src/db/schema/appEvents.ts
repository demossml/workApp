import { index, integer, text } from "drizzle-orm/sqlite-core";
import { sqliteTable } from "./_table";

export const appEvents = sqliteTable(
	"app_events",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		ts: integer("ts").notNull(),
		eventName: text("event_name").notNull(),
		userId: text("user_id"),
		shopUuid: text("shop_uuid"),
		role: text("role"),
		screen: text("screen"),
		traceId: text("trace_id"),
		propsJson: text("props_json"),
		appVersion: text("app_version"),
	},
	(table) => ({
		tsIdx: index("app_events_ts_idx").on(table.ts),
		eventNameIdx: index("app_events_event_name_idx").on(table.eventName),
		userIdIdx: index("app_events_user_id_idx").on(table.userId),
		shopUuidIdx: index("app_events_shop_uuid_idx").on(table.shopUuid),
		traceIdIdx: index("app_events_trace_id_idx").on(table.traceId),
	}),
);

export type AppEventsInsert = typeof appEvents.$inferInsert;
export type AppEventsSelect = typeof appEvents.$inferSelect;
