import { and, eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { tgSubscriptions } from "../schema/tgSubscriptions";

export interface TgSubscriptionSettings {
	openingDeadline?: string;
	refundThresholdPct?: number;
	revenueDropThresholdPct?: number;
}

export interface UpsertTgSubscriptionInput {
	userId: string;
	chatId: string;
	writeAccess?: boolean;
	settings?: TgSubscriptionSettings;
}

export async function upsertTgSubscription(
	db: DrizzleD1Database<Record<string, unknown>>,
	input: UpsertTgSubscriptionInput,
) {
	const now = Date.now();
	await db
		.insert(tgSubscriptions)
		.values({
			userId: input.userId,
			chatId: input.chatId,
			writeAccess: input.writeAccess ? 1 : 0,
			subscribedAt: now,
			lastSentAt: null,
			settingsJson: input.settings ? JSON.stringify(input.settings) : null,
		})
		.onConflictDoUpdate({
			target: [tgSubscriptions.userId, tgSubscriptions.chatId],
			set: {
				writeAccess: input.writeAccess ? 1 : 0,
				settingsJson: input.settings ? JSON.stringify(input.settings) : null,
				subscribedAt: now,
			},
		})
		.run();
}

export async function listActiveTgSubscriptions(
	db: DrizzleD1Database<Record<string, unknown>>,
) {
	return db
		.select()
		.from(tgSubscriptions)
		.where(eq(tgSubscriptions.writeAccess, 1))
		.all();
}

export async function setTgSubscriptionWriteAccess(
	db: DrizzleD1Database<Record<string, unknown>>,
	userId: string,
	chatId: string,
	writeAccess: boolean,
) {
	await db
		.update(tgSubscriptions)
		.set({ writeAccess: writeAccess ? 1 : 0 })
		.where(
			and(eq(tgSubscriptions.userId, userId), eq(tgSubscriptions.chatId, chatId)),
		)
		.run();
}

export async function touchTgSubscriptionLastSentAt(
	db: DrizzleD1Database<Record<string, unknown>>,
	userId: string,
	chatId: string,
) {
	await db
		.update(tgSubscriptions)
		.set({ lastSentAt: Date.now() })
		.where(
			and(eq(tgSubscriptions.userId, userId), eq(tgSubscriptions.chatId, chatId)),
		)
		.run();
}
