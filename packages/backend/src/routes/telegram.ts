import { Hono } from "hono";
import type { IEnv } from "../types";
import { validate } from "../validation";
import {
	TelegramSubscribeSchema,
	TelegramUnsubscribeSchema,
} from "../validation";
import {
	setTgSubscriptionWriteAccess,
	upsertTgSubscription,
} from "../db/repositories/tgSubscriptions";
import { jsonError } from "../errors";

export const telegramRoutes = new Hono<IEnv>()
	.post("/subscribe", async (c) => {
		const payload = validate(
			TelegramSubscribeSchema,
			await c.req.json().catch(() => ({})),
		);
		const userId = c.var.userId || payload.userId || "";
		if (!userId) {
			return jsonError(c, 400, "VALIDATION_ERROR", "userId is required");
		}
		const chatId = payload.chatId || userId;

		await upsertTgSubscription(c.get("drizzle"), {
			userId,
			chatId,
			writeAccess: payload.writeAccess ?? true,
			settings: payload.settings,
		});

		return c.json({ success: true, userId, chatId });
	})
	.post("/unsubscribe", async (c) => {
		const payload = validate(
			TelegramUnsubscribeSchema,
			await c.req.json().catch(() => ({})),
		);
		const userId = c.var.userId || payload.userId || "";
		if (!userId) {
			return jsonError(c, 400, "VALIDATION_ERROR", "userId is required");
		}
		const chatId = payload.chatId || userId;

		await setTgSubscriptionWriteAccess(c.get("drizzle"), userId, chatId, false);
		return c.json({ success: true, userId, chatId });
	});
