import z from "zod";
import { documentSchema } from "../evotor/schema";
import { createTask } from "./helpers";
import { createTool } from "./tools";

export const execAnalyzeDocsTask = createTask({
	task: "Проанализируй документы. Use tools where appropriate",
	inputSchema: z.array(documentSchema),
	outputSchema: z.object({
		total: z.number().describe("общая сумма продаж"),
		barCodeNames: z
			.array(z.string())
			.describe("use lookupBarCodeNames tool for lookup"),
	}),
	maxTokens: 2048,
	temperature: 0.3,
	tools: [
		// createTool({
		// 	name: "lookupBarCodesNames",
		// 	description: "Tool to get barcode names using barcodes",
		// 	input: z.object({ barcodes: z.array(z.string()) }),
		// 	output: z.object({ names: z.array(z.string()) }),
		// 	invoke: async (c, params) => {
		// 		console.log(params);
		// 		return { names: ["сигареты", "сигареты"] };
		// 	},
		// }),
	],
});

export const sum2Numbers = createTask({
	task: "Sum two numbers. Use calculator tool",
	inputSchema: z.object({ a: z.number(), b: z.number() }),
	outputSchema: z.object({ sum: z.number() }),
	maxTokens: 1024,
	temperature: 0,
	tools: [
		createTool({
			name: "calculator",
			description: "Calculator is used to sum pair for numbers",
			input: z.object({ a: z.number(), b: z.number() }),
			output: z.object({ result: z.number() }),
			invoke: async (c, input) => {
				return { result: input.a + input.b };
			},
		}),
	],
});
