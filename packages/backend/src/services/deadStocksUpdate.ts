import type { Context } from "hono";
import type { IEnv, SaveDeadStocksRequest } from "../types";
import { logger } from "../logger";
import { sendDeadStocksToTelegram } from "../../utils/sendDeadStocksToTelegram";
import { saveDeadStocks } from "../db/repositories/saveDeadStocks";
import { trackAppEvent } from "../analytics/track";
import { buildDeadStocksNarrative } from "../ai/deadStocksNarrative";
import { jsonError } from "../errors";

type DeadStocksUpdatePayload = SaveDeadStocksRequest & { userId?: number };

export async function handleDeadStocksUpdate(c: Context<IEnv>) {
	try {
		const db = c.get("drizzle");
		const payload = await c.req.json<DeadStocksUpdatePayload>().catch(() => null);
		if (!payload) {
			return jsonError(c, 400, "INVALID_JSON", "Invalid JSON body");
		}

		const { shopUuid, items } = payload;
		await trackAppEvent(c, "deadstock_save_started", {
			shopUuid,
			props: { itemsCount: Array.isArray(items) ? items.length : 0 },
		});

		if (!shopUuid || !items || !Array.isArray(items)) {
			await trackAppEvent(c, "deadstock_save_failed", {
				shopUuid: shopUuid || undefined,
				props: { reason: "invalid_request_data" },
			});
			return jsonError(c, 400, "VALIDATION_ERROR", "Invalid request data");
		}

		const TELEGRAM_GROUP_ID = "5700958253";
		const aiModel = c.env.AI_MODEL;
		const aiMaxTokens = Number(c.env.AI_MAX_TOKENS || "1000");
		let narrative: string | undefined;

		try {
			const aiResult = await buildDeadStocksNarrative({
				ai: c.var.ai,
				items,
				model: aiModel,
				maxTokens: Number.isFinite(aiMaxTokens) ? aiMaxTokens : 1000,
			});
			narrative = aiResult.narrative || undefined;
			await trackAppEvent(c, "deadstock_ai_success", {
				shopUuid,
				props: { fallbackUsed: aiResult.fallbackUsed },
			});
		} catch (aiError) {
			await trackAppEvent(c, "deadstock_ai_failed", {
				shopUuid,
				props: {
					reason:
						aiError instanceof Error ? aiError.message : "ai_narrative_failed",
				},
			});
			logger.warn("Dead stocks AI narrative failed, continue without AI", {
				shopUuid,
				error: aiError instanceof Error ? aiError.message : String(aiError),
			});
		}

		try {
			await sendDeadStocksToTelegram(
				{
					chatId: TELEGRAM_GROUP_ID,
					shopUuid,
					items,
					narrative,
				},
				c.env.BOT_TOKEN,
				c.var.evotor,
			);
		} catch (telegramError) {
			logger.error("Failed to send to Telegram", telegramError);
			// Не блокируем сохранение в БД, если Telegram недоступен.
		}

		await saveDeadStocks(db, shopUuid, items);
		await trackAppEvent(c, "deadstock_save_success", {
			shopUuid,
			props: { itemsCount: items.length },
		});

		return c.json({ success: true });
	} catch (error) {
		await trackAppEvent(c, "deadstock_save_failed", {
			props: {
				reason:
					error instanceof Error ? error.message : "dead_stocks_update_failed",
			},
		});
		logger.error("Dead stocks update failed", error);
		return c.json(
			{
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to update dead stocks",
			},
			500,
		);
	}
}

