// sendDeadStocksToTelegram.ts

import type { Evotor } from "../src/evotor";
import { logger } from "../src/logger";
import { formatDeadStocksMessage } from "./formatDeadStocksMessage";
import type { DeadStockItem } from "./formatDeadStocksMessage";
import { sendTelegramMessage } from "./sendTelegramMessage";

export async function sendDeadStocksToTelegram(
	params: {
		chatId: number | string;
		shopUuid: string;
		items: DeadStockItem[];
		narrative?: string;
	},
	TELEGRAM_BOT_TOKEN: string,
	evotor: Evotor,
): Promise<unknown> {
	try {
		if (!params.chatId || !params.shopUuid || !params.items?.length) {
			throw new Error(
				"Missing required parameters for dead stocks notification",
			);
		}

		const text = await formatDeadStocksMessage(
			evotor,
			params.shopUuid,
			params.items,
			params.narrative,
		);

		if (!text || text.trim().length === 0) {
			throw new Error("Empty message generated for dead stocks");
		}

		return sendTelegramMessage(params.chatId, text, TELEGRAM_BOT_TOKEN);
	} catch (error) {
		logger.error("Failed to send dead stocks to Telegram", {
			shopUuid: params.shopUuid,
			itemsCount: params.items?.length || 0,
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
}
