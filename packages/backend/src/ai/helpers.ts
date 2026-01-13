import type { ZodSchema } from "zod";
import zodToJsonSchema from "zod-to-json-schema";
import type { IContext } from "../types";
import { type ITool, tools } from "./tools";

export type RoleScopedChatInput = {
	role: "system" | "user" | "assistant" | "tool";
	content: string;
	name?: string;
};

export type AiTextGenerationOutput = {
	response: string;
	tool_calls?: Array<{
		name: string;
		arguments: any;
	}>;
};

export type LocalAiModels = {
	c: unknown;
	// Добавьте другие модели, если используете
	[key: string]: unknown; // Allow additional keys dynamically
};
/**
 * Повторяет вызов функции fn до 5 раз при ошибке аутентификации AI.
 */
async function runWithRetry<T>(fn: () => Promise<T>, retries = 5): Promise<T> {
	for (let attempt = 1; attempt <= retries; attempt++) {
		try {
			return await fn();
		} catch (e: any) {
			const msg = e?.message || e?.toString?.() || "";
			if (
				msg.includes("InferenceUpstreamError: 10000: Authentication error") &&
				attempt < retries
			) {
				console.warn(`AI auth error, retrying attempt ${attempt}...`);
				await new Promise((res) => setTimeout(res, 500 * attempt));
				continue;
			}
			throw e;
		}
	}
	throw new Error("Max retries reached for AI authentication error");
}

/**
 * Разбивает массив на чанки указанного размера.
 */
export function chunkArray<T>(arr: T[], size: number): T[][] {
	return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
		arr.slice(i * size, i * size + size),
	);
}

// const DEFAULT_MODEL = "@cf/mistralai/mistral-small-3.1-24b-instruct" as const;
const DEFAULT_MODEL = "@cf/google/gemma-3-12b-it" as const;

export type AiModels = {
	[DEFAULT_MODEL]: unknown;
	// Добавьте другие модели, если используете
};

/**
 * Запускает AI с поддержкой инструментов (tools) и повторными попытками при ошибках аутентификации.
 */
export const runWithTools = async (
	c: IContext,
	params: {
		messages: RoleScopedChatInput[];
		model?: keyof AiModels;
		maxTokens?: number;
		temperature?: number;
		tools?: ITool[];
	},
): Promise<string | undefined> => {
	const model = (params.model ?? DEFAULT_MODEL) as keyof AiModels;

	const max_tokens = params.maxTokens || 10240;
	const temperature = params.temperature || 0.4;
	const messages = params.messages;

	// console.log(
	// 	"AI Request",
	// 	model,
	// 	JSON.stringify(
	// 		{
	// 			messages,
	// 			max_tokens,
	// 			temperature,
	// 			tools: params.tools?.map((t) => t.schema),
	// 		},
	// 		null,
	// 		2,
	// 	),
	// );

	const { response, tool_calls = [] } = await runWithRetry(
		() =>
			c.env.AI.run(model as any, {
				messages,
				max_tokens,
				temperature,
				tools: params.tools?.map((t) => t.schema),
			}) as Promise<Exclude<AiTextGenerationOutput, ReadableStream>>,
	);

	// console.log("Tool Calls", tool_calls);

	if (tool_calls && tool_calls.length > 0) {
		for (const { name, arguments: args } of tool_calls) {
			try {
				const tool = tools.get(name);
				if (!tool) {
					throw new Error(`Tool ${name} not found`);
				}

				const params = tool.input.parse(args);
				const result = await tool.invoke(c, params);

				messages.push({
					role: "assistant",
					content: JSON.stringify({ name, arguments: args }),
				});

				messages.push({
					role: "tool",
					content: JSON.stringify(result),
					name,
				});
			} catch (e) {
				console.error("Tool call error:", e);
				messages.push({
					role: "tool",
					content: `Error: ${e instanceof Error ? e.message : String(e)}`,
					name,
				});
			}
		}
		// Рекурсия ТОЛЬКО при наличии tool calls
		return runWithTools(c, { ...params, messages });
	}

	// Обработка JSON-ответа без tool calls
	console.log("RESPONSE:", response);
	return response;
};

/**
 * Универсальный генератор AI-задач с валидацией входных и выходных данных.
 * Если входной массив слишком большой — разбивает его на чанки и агрегирует результат.
 */
export function createChunkedTask<T, U>(
	taskFn: (c: IContext, input: T[]) => Promise<U>,
	chunkSize = 1000,
	aggregateFn?: (results: U[]) => U,
) {
	return async (c: IContext, input: T[]): Promise<U> => {
		if (input.length <= chunkSize) {
			return taskFn(c, input);
		}
		const chunks = chunkArray(input, chunkSize);
		const results: U[] = [];
		for (const chunk of chunks) {
			results.push(await taskFn(c, chunk));
		}
		if (aggregateFn) {
			return aggregateFn(results);
		}
		// По умолчанию возвращаем массив результатов
		return results as unknown as U;
	};
}

// /**
//  * Универсальный генератор AI-задач с валидацией входных и выходных данных.
//  */
// export const createTask =
// 	<T, U>(params: {
// 		task: string;
// 		inputSchema: ZodSchema<T>;
// 		outputSchema: ZodSchema<U>;
// 		model?: keyof AiModels;
// 		maxTokens?: number;
// 		temperature?: number;
// 		tools?: ITool[];
// 	}) =>
// 	async (c: IContext, input: T): Promise<U> => {
// 		// Валидация входных данных
// 		try {
// 			params.inputSchema.parse(input);
// 		} catch (e: any) {
// 			console.error("Input validation error:", e.issues ?? e);
// 			throw new Error("Invalid input: " + JSON.stringify(e.issues ?? e));
// 		}

// 		const iSchema = JSON.stringify(zodToJsonSchema(params.inputSchema));
// 		const oSchema = JSON.stringify(zodToJsonSchema(params.outputSchema));

// 		let response = await runWithTools(c, {
// 			...params,
// 			messages: [
// 				{
// 					role: "system",
// 					content: `${params.task}.
//             Input Schema: ${iSchema}.
//             Output Schema: ${oSchema}.
//             Respond only with JSON, using output schema.`,
// 				},
// 				{
// 					role: "user",
// 					content: JSON.stringify(input),
// 				},
// 			],
// 		});

// 		if (!response) {
// 			throw new Error("Empty response from AI");
// 		}

// 		// Удаление обёртки ```json ... ```
// 		response = response.trim();
// 		if (response.startsWith("```json")) {
// 			response = response.slice(7).trim();
// 		}
// 		if (response.endsWith("```")) {
// 			response = response.slice(0, -3).trim();
// 		}

// 		try {
// 			const parsed = JSON.parse(response);
// 			return params.outputSchema.parse(parsed);
// 		} catch (e) {
// 			console.error("Response parsing or validation error:", e);
// 			throw new Error("Failed to parse or validate response: " + response);
// 		}
// 	};

function jsonToCsv<T extends object>(data: T[]): string {
	if (!data.length) return "";
	const keys = Object.keys(data[0]);
	const csvRows = [
		keys.join(","),
		...data.map((row) =>
			keys.map((k) => JSON.stringify((row as any)[k] ?? "")).join(","),
		),
	];
	return csvRows.join("\n");
}

export const createTask =
	<T, U>(params: {
		task: string;
		inputSchema: ZodSchema<T>;
		outputSchema: ZodSchema<U>;
		model?: keyof AiModels;
		maxTokens?: number;
		temperature?: number;
		tools?: ITool[];
		asCsv?: boolean;
	}) =>
	async (c: IContext, input: T): Promise<U> => {
		// Валидация входных данных
		try {
			params.inputSchema.parse(input);
		} catch (e: any) {
			console.error("Input validation error:", e.issues ?? e);
			throw new Error(`Invalid input: ${JSON.stringify(e.issues ?? e)}`);
		}

		const iSchema = JSON.stringify(zodToJsonSchema(params.inputSchema));
		const oSchema = JSON.stringify(zodToJsonSchema(params.outputSchema));

		let userContent: string;
		if (params.asCsv && Array.isArray(input)) {
			userContent = jsonToCsv(input);
		} else {
			userContent = JSON.stringify(input);
		}

		let response = await runWithTools(c, {
			...params,
			messages: [
				{
					role: "system",
					content: `${params.task}.
Input Schema: ${iSchema}.
Output Schema: ${oSchema}.
Respond only with JSON, using output schema.${params.asCsv ? " Входные данные предоставлены в формате CSV, первая строка — заголовки столбцов." : ""}`,
				},
				{
					role: "user",
					content: userContent,
				},
			],
		});

		if (!response) {
			throw new Error("Empty response from AI");
		}

		// Удаление обёртки ```json ... ```
		response = response.trim();
		if (response.startsWith("```json")) {
			response = response.slice(7).trim();
		}
		if (response.endsWith("```")) {
			response = response.slice(0, -3).trim();
		}

		try {
			const parsed = JSON.parse(response);
			return params.outputSchema.parse(parsed);
		} catch (e) {
			console.error("Response parsing or validation error:", e);
			throw new Error(`Failed to parse or validate response:  ${response}`);
		}
	};
