import { index, integer, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sqliteTable } from "./_table";

export const tgSubscriptions = sqliteTable(
	"tg_subscriptions",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		userId: text("user_id").notNull(),
		chatId: text("chat_id").notNull(),
		writeAccess: integer("write_access").notNull().default(0),
		subscribedAt: integer("subscribed_at").notNull(),
		lastSentAt: integer("last_sent_at"),
		settingsJson: text("settings_json"),
	},
	(table) => ({
		userIdIdx: index("tg_subscriptions_user_id_idx").on(table.userId),
		chatIdIdx: index("tg_subscriptions_chat_id_idx").on(table.chatId),
		userChatUidx: uniqueIndex("tg_subscriptions_user_chat_uidx").on(
			table.userId,
			table.chatId,
		),
	}),
);

export type TgSubscriptionsInsert = typeof tgSubscriptions.$inferInsert;
export type TgSubscriptionsSelect = typeof tgSubscriptions.$inferSelect;
