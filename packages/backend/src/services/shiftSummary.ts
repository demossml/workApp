import { drizzle } from "drizzle-orm/d1";
import type { IEnv } from "../types";
import { getDocumentsFromIndexFirst } from "./indexDocumentsFallback";
import { formatDateWithTime } from "../utils";
import { generateNarrative } from "../ai/client";
import { logger } from "../logger";
import {
	listActiveTgSubscriptions,
	touchTgSubscriptionLastSentAt,
} from "../db/repositories/tgSubscriptions";
import { sendTelegramMessage } from "../../utils/sendTelegramMessage";
import { getPlan } from "../db/repositories/plan";
import { saveAiShiftSummary } from "../db/repositories/aiHistory";

const SHIFT_SUMMARY_PROMPT = `
Ты операционный директор розничной сети.
Сформируй краткий итог смены на русском языке.

Формат:
1) 1-2 факта по выручке и динамике.
2) 1 сильная сторона смены.
3) 1 проблемная зона.
4) 2 конкретных действия на завтра.

Требования:
- Только факты из входных данных.
- Кратко и по делу, без воды.
`.trim();

const toMskNow = () => new Date(Date.now() + 3 * 60 * 60 * 1000);

const formatDateIso = (date: Date) => {
	const yyyy = date.getUTCFullYear();
	const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
	const dd = String(date.getUTCDate()).padStart(2, "0");
	return `${yyyy}-${mm}-${dd}`;
};

const formatDateDDMMYYYY = (date: Date) => {
	const dd = String(date.getUTCDate()).padStart(2, "0");
	const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
	const yyyy = date.getUTCFullYear();
	return `${dd}-${mm}-${yyyy}`;
};

const computeShiftMetrics = (
	docs: Awaited<ReturnType<typeof getDocumentsFromIndexFirst>>,
) => {
	let revenue = 0;
	let refunds = 0;
	let checks = 0;
	const employeeRevenue = new Map<string, number>();

	for (const doc of docs) {
		const isRefund = doc.type === "PAYBACK";
		if (doc.type === "SELL") checks += 1;
		let docSum = 0;
		for (const tx of doc.transactions || []) {
			if (tx.type !== "PAYMENT") continue;
			const amount = Number(tx.sum || 0);
			if (!Number.isFinite(amount) || amount === 0) continue;
			docSum += Math.abs(amount);
		}
		if (isRefund) {
			revenue -= docSum;
			refunds += docSum;
		} else {
			revenue += docSum;
		}

		if (!isRefund && doc.openUserUuid) {
			employeeRevenue.set(
				doc.openUserUuid,
				(employeeRevenue.get(doc.openUserUuid) || 0) + docSum,
			);
		}
	}

	return { revenue, refunds, checks, employeeRevenue };
};

const buildFallbackSummary = (input: {
	shopName: string;
	revenue: number;
	planRevenue: number | null;
	refunds: number;
	checks: number;
	topEmployeeName: string | null;
}) => {
	const planPart =
		typeof input.planRevenue === "number" && input.planRevenue > 0
			? `План: ${Math.round(input.planRevenue).toLocaleString("ru-RU")} ₽.`
			: "План на смену не задан.";
	const topEmployeePart = input.topEmployeeName
		? `Лидер смены: ${input.topEmployeeName}.`
		: "Лидер смены не определен.";

	return (
		`Смена закрыта (${input.shopName}).\n` +
		`Выручка: ${Math.round(input.revenue).toLocaleString("ru-RU")} ₽, чеков: ${input.checks}, возвраты: ${Math.round(input.refunds).toLocaleString("ru-RU")} ₽.\n` +
		`${planPart}\n` +
		`${topEmployeePart}\n` +
		`Действия: 1) проверить причины возвратов; 2) усилить продажи в слабые часы.`
	);
};

export async function generateAndSendShiftSummary(input: {
	bindings: IEnv["Bindings"];
	evotor: IEnv["Variables"]["evotor"];
	ai: IEnv["Variables"]["ai"];
	shopUuid: string;
}) {
	const nowMsk = toMskNow();
	const isoDate = formatDateIso(nowMsk);
	const dateDDMMYYYY = formatDateDDMMYYYY(nowMsk);

	const since = formatDateWithTime(new Date(`${isoDate}T00:00:00.000Z`), false);
	const until = formatDateWithTime(new Date(`${isoDate}T00:00:00.000Z`), true);

	const [docs, shopName, planByShop] = await Promise.all([
		getDocumentsFromIndexFirst(
			input.bindings.DB,
			input.evotor,
			input.shopUuid,
			since,
			until,
			{ types: ["SELL", "PAYBACK"], skipFetchIfStale: true },
		),
		input.evotor.getShopName(input.shopUuid),
		getPlan(dateDDMMYYYY, input.bindings.DB),
	]);

	const metrics = computeShiftMetrics(docs);
	const sortedEmployees = Array.from(metrics.employeeRevenue.entries()).sort(
		(a, b) => b[1] - a[1],
	);
	const topEmployeeUuid = sortedEmployees[0]?.[0] || null;
	let topEmployeeName: string | null = null;
	if (topEmployeeUuid) {
		try {
			const names = await input.evotor.getEmployeeNamesByUuids([topEmployeeUuid]);
			topEmployeeName = names[topEmployeeUuid] || topEmployeeUuid;
		} catch {
			topEmployeeName = topEmployeeUuid;
		}
	}

	const planRevenue =
		planByShop && Number.isFinite(Number(planByShop[input.shopUuid]))
			? Number(planByShop[input.shopUuid])
			: null;

	let summaryText = buildFallbackSummary({
		shopName,
		revenue: metrics.revenue,
		planRevenue,
		refunds: metrics.refunds,
		checks: metrics.checks,
		topEmployeeName,
	});

	try {
		const aiResult = await generateNarrative({
			ai: input.ai,
			systemPrompt: SHIFT_SUMMARY_PROMPT,
			data: {
				date: isoDate,
				shopName,
				revenue: Math.round(metrics.revenue),
				refunds: Math.round(metrics.refunds),
				checks: metrics.checks,
				planRevenue: planRevenue == null ? null : Math.round(planRevenue),
				topEmployeeName,
			},
			model: input.bindings.AI_MODEL,
			maxTokens: Number(input.bindings.AI_MAX_TOKENS || "900"),
			temperature: 0.2,
			timeoutMs: 10_000,
			maxRetries: 1,
		});
		if (!aiResult.fallbackUsed && aiResult.text) {
			summaryText = aiResult.text;
		}
	} catch (error) {
		logger.warn("Shift summary AI generation failed, using fallback", {
			shopUuid: input.shopUuid,
			error: error instanceof Error ? error.message : String(error),
		});
	}

	await saveAiShiftSummary(input.bindings.DB, {
		shopUuid: input.shopUuid,
		date: isoDate,
		summaryText,
		revenueActual: metrics.revenue,
		revenuePlan: planRevenue,
		topEmployee: topEmployeeName,
		anomalies: [],
		recommendations: [],
	});

	const db = drizzle(input.bindings.DB);
	const subscriptions = await listActiveTgSubscriptions(db);
	if (subscriptions.length === 0) return;

	const header = `📊 Итог смены — ${shopName}, ${isoDate}`;
	const message = `${header}\n\n${summaryText}`;
	for (const sub of subscriptions) {
		try {
			await sendTelegramMessage(sub.chatId, message, input.bindings.BOT_TOKEN);
			await touchTgSubscriptionLastSentAt(db, sub.userId, sub.chatId);
		} catch (error) {
			logger.warn("Shift summary telegram send failed", {
				shopUuid: input.shopUuid,
				chatId: sub.chatId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}

