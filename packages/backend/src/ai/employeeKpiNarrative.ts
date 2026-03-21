import type { IEnv } from "../types";
import { logger } from "../logger";
import { generateNarrative } from "./client";

const EMPLOYEE_KPI_SYSTEM_PROMPT = `
Ты бизнес-коуч для команды розничного магазина.
По входным KPI дай краткий разбор на русском языке.

Формат:
1) 1-2 сильные стороны команды/смены.
2) 1-2 зоны роста.
3) 2 конкретных действия на следующую смену.

Требования:
- Кратко и по делу, без воды.
- Используй только данные из входа.
- Без выдуманных метрик.
`.trim();

type EmployeeKpiNarrativeInput = {
	ai: IEnv["Bindings"]["AI"];
	model?: string;
	maxTokens?: number;
	data: {
		period: {
			startDate: string;
			endDate: string;
			days: number;
		};
		overall: {
			revenue: number;
			checks: number;
			avgCheck: number;
			returnRate: number;
			marginPercent: number;
		};
		topEmployees: Array<{
			employeeName: string;
			score: number;
			avgCheck: number;
			returnRate: number;
			reasons: string[];
		}>;
		problemEmployees: Array<{
			employeeName: string;
			score: number;
			avgCheck: number;
			returnRate: number;
			reasons: string[];
		}>;
		shiftSummary: Array<{
			shift: string;
			avgCheck: number;
			returnRate: number;
			reasons: string[];
		}>;
	};
};

export async function buildEmployeeKpiNarrative(
	input: EmployeeKpiNarrativeInput,
): Promise<{ narrative: string | null; fallbackUsed: boolean }> {
	const result = await generateNarrative({
		ai: input.ai,
		systemPrompt: EMPLOYEE_KPI_SYSTEM_PROMPT,
		data: input.data,
		model: input.model,
		maxTokens: input.maxTokens,
		temperature: 0.2,
		timeoutMs: 10_000,
		maxRetries: 2,
	});

	if (result.fallbackUsed) {
		logger.warn("Employee KPI narrative fallback used", {
			error: result.error || "unknown",
		});
		return { narrative: null, fallbackUsed: true };
	}

	return { narrative: result.text, fallbackUsed: false };
}

