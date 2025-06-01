import type { ZodSchema } from "zod";
import zodToJsonSchema from "zod-to-json-schema";
import type { IContext } from "../types";
import { type ITool, tools } from "./tools";

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
	const model = params.model || "@hf/nousresearch/hermes-2-pro-mistral-7b";
	// ("@cf/mistralai/mistral-small-3.1-24b-instruct" as keyof AiModels);

	const max_tokens = params.maxTokens || 10240;
	const temperature = params.temperature || 0.7;
	const messages = params.messages;

	console.log(
		"AI Request",
		model,
		JSON.stringify(
			{
				messages,
				max_tokens,
				temperature,
				tools: params.tools?.map((t) => t.schema),
			},
			null,
			2,
		),
	);

	const { response, tool_calls = [] } = (await c.env.AI.run(model, {
		messages,
		max_tokens,
		temperature,
		tools: params.tools?.map((t) => t.schema),
	})) as Exclude<AiTextGenerationOutput, ReadableStream>;

	console.log("Tool Calls", tool_calls);

	for (const { name, arguments: args } of tool_calls) {
		const tool = tools.get(name);
		const params = tool?.input.parse(args);
		const result = await tool?.invoke(c, params);

		messages.push({
			role: "assistant",
			content: JSON.stringify({ name, arguments: args }),
		});

		messages.push({
			role: "tool",
			content: JSON.stringify(result),
			name,
		});
	}

	if (tool_calls.length) {
		return runWithTools(c, { ...params, messages });
	}

	console.log("RESPONSE:", response);

	return response?.split("\n").pop();
};

export const createTask =
	<T, U>(params: {
		task: string;
		inputSchema: ZodSchema<T>;
		outputSchema: ZodSchema<U>;
		model?: keyof AiModels;
		maxTokens?: number;
		temperature?: number;
		tools?: ITool[];
	}) =>
	async (c: IContext, input: T): Promise<U> => {
		// TODO: fix
		// try {
		// 	params.inputSchema.parse(input);
		// } catch (e) {
		// 	console.log(e.issues);
		// 	throw e;
		// }

		const iSchema = JSON.stringify(zodToJsonSchema(params.inputSchema));
		const oSchema = JSON.stringify(zodToJsonSchema(params.outputSchema));

		let response = await runWithTools(c, {
			...params,
			messages: [
				{
					role: "system",
					content: `${params.task}.
					Input Schema: ${iSchema}.
					Output Schema: ${oSchema}. 
					Respond only with JSON, using output schema.`,
				},
				{
					role: "user",
					content: JSON.stringify(input),
				},
			],
		});

		// ```json
		// { "summary": "..." }
		// ```

		if (response?.startsWith("```json")) {
			response = response.trim().slice(7, response.length - 3);
		}

		console.log(response);

		return params.outputSchema.parse(JSON.parse(response as string));
	};
