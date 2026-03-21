import type { IEnv, DeadStockItem } from "../types";
import { logger } from "../logger";
import { generateNarrative } from "./client";

const DEAD_STOCKS_SYSTEM_PROMPT = `
Ты эксперт по розничным продажам вейп-магазина.
Твоя задача: по списку зависших товаров дать короткий и конкретный анализ.

Формат:
1) До 3 ключевых причин, почему позиции не продаются.
2) До 3 действий на ближайшие 3 дня, каждое действие в одной строке.
3) Короткий ожидаемый эффект (без выдуманных точных цифр, если их нет во входных данных).

Требования:
- Пиши на русском.
- Кратко, по делу, без воды.
- Не выдумывай данные, которых нет во входе.
`.trim();

type BuildDeadStocksNarrativeInput = {
	ai: IEnv["Bindings"]["AI"];
	items: DeadStockItem[];
	model?: string;
	maxTokens?: number;
};

export async function buildDeadStocksNarrative(
	input: BuildDeadStocksNarrativeInput,
): Promise<{ narrative: string | null; fallbackUsed: boolean }> {
	if (!input.items.length) {
		return { narrative: null, fallbackUsed: false };
	}

	const compactItems = input.items.map((item) => ({
		name: item.name,
		quantity: item.quantity,
		sold: item.sold,
		lastSaleDate: item.lastSaleDate,
		mark: item.mark ?? null,
		moveCount: item.moveCount ?? null,
		moveToStore: item.moveToStore ?? null,
	}));

	const result = await generateNarrative({
		ai: input.ai,
		systemPrompt: DEAD_STOCKS_SYSTEM_PROMPT,
		data: { items: compactItems },
		model: input.model,
		maxTokens: input.maxTokens,
		temperature: 0.2,
		timeoutMs: 10_000,
		maxRetries: 2,
	});

	if (result.fallbackUsed) {
		logger.warn("Dead stocks narrative fallback used", {
			error: result.error || "unknown",
		});
		// Для Telegram не отправляем технический fallback-текст, чтобы не шуметь.
		return { narrative: null, fallbackUsed: true };
	}

	return { narrative: result.text, fallbackUsed: false };
}

