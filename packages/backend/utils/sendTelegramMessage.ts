import { logger } from "../src/logger";

export interface TelegramSendMessageResponse {
	ok: boolean;
	result?: unknown;
	description?: string;
}

export async function sendTelegramMessage(
	chatId: number | string,
	text: string,
	TELEGRAM_BOT_TOKEN: string,
) {
	try {
		if (!TELEGRAM_BOT_TOKEN) {
			throw new Error("TELEGRAM_BOT_TOKEN is not configured");
		}

		if (!chatId || !text) {
			throw new Error("chatId and text are required");
		}

		const response = await fetch(
			`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					chat_id: chatId,
					text,
					parse_mode: "HTML",
					disable_web_page_preview: true,
				}),
			},
		);

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Telegram API error (${response.status}): ${errorText}`);
		}

		const data = (await response.json()) as TelegramSendMessageResponse;

		if (!data.ok) {
			throw new Error(
				data.description || "Не удалось отправить сообщение в Telegram",
			);
		}

		logger.debug("Telegram message sent successfully", { chatId });
		return data.result;
	} catch (error) {
		logger.error("Failed to send Telegram message", {
			chatId,
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
}
