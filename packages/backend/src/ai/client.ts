import type { Ai } from "@cloudflare/workers-types";
import { logger } from "../logger";

type GenerateNarrativeInput = {
	ai: Ai;
	systemPrompt: string;
	data: unknown;
	model?: string;
	maxTokens?: number;
	temperature?: number;
	timeoutMs?: number;
	maxRetries?: number;
};

type GenerateNarrativeResult = {
	text: string;
	fallbackUsed: boolean;
	error?: string;
};

const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const DEFAULT_MAX_TOKENS = 800;
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 2;

const sleep = (ms: number) =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

const withTimeout = async <T>(
	promise: Promise<T>,
	timeoutMs: number,
): Promise<T> => {
	let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
	try {
		return await Promise.race([
			promise,
			new Promise<T>((_, reject) => {
				timeoutHandle = setTimeout(() => {
					reject(new Error(`AI request timeout after ${timeoutMs}ms`));
				}, timeoutMs);
			}),
		]);
	} finally {
		if (timeoutHandle) {
			clearTimeout(timeoutHandle);
		}
	}
};

const extractAiText = (result: unknown): string => {
	if (typeof result === "string") return result.trim();
	if (!result || typeof result !== "object") return "";
	const asAny = result as Record<string, unknown>;

	if (typeof asAny.response === "string") return asAny.response.trim();
	if (typeof asAny.result === "string") return asAny.result.trim();
	if (
		asAny.result &&
		typeof asAny.result === "object" &&
		typeof (asAny.result as Record<string, unknown>).response === "string"
	) {
		return ((asAny.result as Record<string, unknown>).response as string).trim();
	}

	return "";
};

const buildFallbackNarrative = (data: unknown): string => {
	const payloadPreview =
		typeof data === "object" && data !== null
			? JSON.stringify(data).slice(0, 500)
			: String(data ?? "");
	return `AI-недоступен. Используйте исходные данные для ручного анализа: ${payloadPreview}`;
};

export async function generateNarrative(
	input: GenerateNarrativeInput,
): Promise<GenerateNarrativeResult> {
	const model = input.model || DEFAULT_MODEL;
	const maxTokens = input.maxTokens ?? DEFAULT_MAX_TOKENS;
	const temperature = input.temperature ?? DEFAULT_TEMPERATURE;
	const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const maxRetries = input.maxRetries ?? DEFAULT_MAX_RETRIES;

	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
		try {
			const startedAt = Date.now();
			const result = await withTimeout(
				(input.ai.run as any)(model, {
					max_tokens: maxTokens,
					temperature,
					messages: [
						{ role: "system", content: input.systemPrompt },
						{
							role: "user",
							content:
								typeof input.data === "string"
									? input.data
									: JSON.stringify(input.data),
						},
					],
				}),
				timeoutMs,
			);

			const text = extractAiText(result);
			if (text) {
				logger.info("AI narrative generated", {
					model,
					latencyMs: Date.now() - startedAt,
					attempt,
					fallbackUsed: false,
				});
				return { text, fallbackUsed: false };
			}

			throw new Error("AI response is empty");
		} catch (error) {
			lastError =
				error instanceof Error ? error : new Error("Unknown AI error");

			const isLastAttempt = attempt >= maxRetries;
			logger.warn("AI narrative generation failed", {
				model,
				attempt,
				isLastAttempt,
				error: lastError.message,
			});

			if (!isLastAttempt) {
				const backoffMs = Math.min(8_000, 1_000 * 2 ** attempt);
				await sleep(backoffMs);
			}
		}
	}

	const fallback = buildFallbackNarrative(input.data);
	return {
		text: fallback,
		fallbackUsed: true,
		error: lastError?.message || "AI generation failed",
	};
}
