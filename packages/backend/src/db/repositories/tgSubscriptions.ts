import type { D1Adapter } from "../../db-duckdb";

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
  db: D1Adapter,
  input: UpsertTgSubscriptionInput,
) {
  const now = Date.now();
  // DuckDB doesn't have ON CONFLICT, use INSERT OR REPLACE
  await db.prepare(`
    INSERT OR REPLACE INTO tg_subscriptions (user_id, chat_id, write_access, subscribed_at, last_sent_at, settings_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    input.userId,
    input.chatId,
    input.writeAccess ? 1 : 0,
    now,
    null,
    input.settings ? JSON.stringify(input.settings) : null,
  ).run();
}

export async function listActiveTgSubscriptions(
  db: D1Adapter,
) {
  const result = await db.prepare(`
    SELECT * FROM tg_subscriptions WHERE write_access = 1
  `).all();
  return result.results;
}

export async function setTgSubscriptionWriteAccess(
  db: D1Adapter,
  userId: string,
  chatId: string,
  writeAccess: boolean,
) {
  await db.prepare(`
    UPDATE tg_subscriptions SET write_access = ? WHERE user_id = ? AND chat_id = ?
  `).bind(writeAccess ? 1 : 0, userId, chatId).run();
}

export async function touchTgSubscriptionLastSentAt(
  db: D1Adapter,
  userId: string,
  chatId: string,
) {
  await db.prepare(`
    UPDATE tg_subscriptions SET last_sent_at = ? WHERE user_id = ? AND chat_id = ?
  `).bind(Date.now(), userId, chatId).run();
}
