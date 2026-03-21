import { drizzle } from "drizzle-orm/d1";
import type { IEnv } from "../types";
import { Evotor } from "../evotor";
import { getDocumentsFromIndexFirst } from "../services/indexDocumentsFallback";
import { getOpeningsByDate } from "../db/repositories/openStores";
import { getPlan } from "../db/repositories/plan";
import {
	listActiveTgSubscriptions,
	touchTgSubscriptionLastSentAt,
} from "../db/repositories/tgSubscriptions";
import { sendTelegramMessage } from "../../utils/sendTelegramMessage";
import { logger } from "../logger";
import { generateNarrative } from "../ai/client";
import { saveAiAlert } from "../db/repositories/aiHistory";

type TempoAlertItem = {
	shopUuid: string;
	shopName: string;
	actualRevenue: number;
	planRevenue: number;
	forecastRevenue: number;
	planProgressPct: number;
	forecastPct: number;
	missingRevenue: number;
	openingHour: number;
	elapsedHours: number;
	totalHours: number;
	recommendations: string[];
};

const toMskNow = () => new Date(Date.now() + 3 * 60 * 60 * 1000);

const formatMskDateIso = (date: Date) => {
	const yyyy = date.getUTCFullYear();
	const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
	const dd = String(date.getUTCDate()).padStart(2, "0");
	return `${yyyy}-${mm}-${dd}`;
};

const formatMskDateDDMMYYYY = (date: Date) => {
	const dd = String(date.getUTCDate()).padStart(2, "0");
	const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
	const yyyy = date.getUTCFullYear();
	return `${dd}-${mm}-${yyyy}`;
};

const formatClock = (date: Date) =>
	`${String(date.getUTCHours()).padStart(2, "0")}:${String(
		date.getUTCMinutes(),
	).padStart(2, "0")}`;

const roundMoney = (value: number) => Math.round(value);

const getOpeningHourMsk = (
	shopUuid: string,
	openingsByShop: Map<string, string>,
): number => {
	const openedAt = openingsByShop.get(shopUuid);
	if (!openedAt) return 9;
	const date = new Date(openedAt);
	if (Number.isNaN(date.getTime())) return 9;
	date.setHours(date.getHours() + 3);
	return Math.min(Math.max(date.getHours(), 0), 23);
};

const buildDefaultRecommendations = (alert: TempoAlertItem): string[] => [
	"Активировать короткую промо-механику на ходовые SKU до конца смены.",
	"Сместить фокус персонала на допродажи к основным покупкам.",
	`Закрыть разрыв минимум на ${roundMoney(alert.missingRevenue).toLocaleString(
		"ru-RU",
	)} ₽ до конца дня.`,
];

const buildTempoAlertText = (
	alerts: TempoAlertItem[],
	nowMsk: Date,
	thresholdPct: number,
) => {
	const header = `⚠️ Алерт темпа ${formatClock(nowMsk)} (МСК)\nПорог прогноза: ${thresholdPct}% плана`;
	const body = alerts
		.map((item, idx) => {
			const recommendations = item.recommendations
				.slice(0, 3)
				.map((line) => `• ${line}`)
				.join("\n");
			return (
				`\n\n${idx + 1}. <b>${item.shopName}</b>\n` +
				`Текущий факт: ${roundMoney(item.actualRevenue).toLocaleString("ru-RU")} ₽ (${item.planProgressPct.toFixed(1)}% плана)\n` +
				`Прогноз дня: ${roundMoney(item.forecastRevenue).toLocaleString("ru-RU")} ₽ (${item.forecastPct.toFixed(1)}% плана)\n` +
				`План: ${roundMoney(item.planRevenue).toLocaleString("ru-RU")} ₽\n` +
				`Нужно добрать: ${roundMoney(item.missingRevenue).toLocaleString("ru-RU")} ₽\n` +
				`Окно смены: ${String(item.openingHour).padStart(2, "0")}:00-${String(
					item.openingHour + item.totalHours - 1,
				).padStart(2, "0")}:59\n` +
				`Рекомендации:\n${recommendations}`
			);
		})
		.join("");

	return `${header}${body}`;
};

async function buildAiRecommendations(
	bindings: IEnv["Bindings"],
	alert: Omit<TempoAlertItem, "recommendations">,
): Promise<string[] | null> {
	const result = await generateNarrative({
		ai: bindings.AI,
		systemPrompt:
			"Ты операционный директор розничной сети. Дай 3 коротких практичных действия на 2-4 часа для ускорения выручки. Только список действий, без вступлений.",
		data: {
			shopName: alert.shopName,
			actualRevenue: Math.round(alert.actualRevenue),
			planRevenue: Math.round(alert.planRevenue),
			forecastRevenue: Math.round(alert.forecastRevenue),
			planProgressPct: Number(alert.planProgressPct.toFixed(1)),
			forecastPct: Number(alert.forecastPct.toFixed(1)),
			missingRevenue: Math.round(alert.missingRevenue),
			elapsedHours: alert.elapsedHours,
			totalHours: alert.totalHours,
		},
		model: bindings.AI_MODEL,
		maxTokens: Number(bindings.AI_MAX_TOKENS || "500"),
		temperature: 0.2,
		timeoutMs: 9_000,
		maxRetries: 1,
	});

	if (result.fallbackUsed || !result.text) return null;

	const lines = result.text
		.split("\n")
		.map((line) => line.replace(/^[-•\d\.\)\s]+/, "").trim())
		.filter(Boolean)
		.slice(0, 3);

	return lines.length > 0 ? lines : null;
}

export async function runTempoAlerts(bindings: IEnv["Bindings"]) {
	const db = drizzle(bindings.DB);
	const evotor = new Evotor(bindings.EVOTOR_API_TOKEN, bindings.KV);
	const subscriptions = await listActiveTgSubscriptions(db);
	if (subscriptions.length === 0) return;

	const nowMsk = toMskNow();
	const dateIso = formatMskDateIso(nowMsk);
	const dateDDMMYYYY = formatMskDateDDMMYYYY(nowMsk);
	const thresholdPct = Number(bindings.ALERT_THRESHOLD_PCT ?? 80);
	const thresholdRatio = Math.max(0, thresholdPct) / 100;
	const nowHour = nowMsk.getUTCHours();
	const shopUuids = await evotor.getShopUuids();
	const [shopNamesMap, openings, planByShop] = await Promise.all([
		evotor.getShopNamesByUuids(shopUuids),
		getOpeningsByDate(bindings.DB, dateDDMMYYYY),
		getPlan(dateDDMMYYYY, bindings.DB),
	]);

	if (!shopUuids || shopUuids.length === 0) return;
	if (!planByShop) {
		logger.warn("Tempo alerts skipped: plan for today not found", {
			dateDDMMYYYY,
		});
		return;
	}

	const openingsByShop = new Map<string, string>();
	for (const row of openings) {
		if (!row.shopUuid || !row.date) continue;
		const prev = openingsByShop.get(row.shopUuid);
		if (!prev || row.date < prev) openingsByShop.set(row.shopUuid, row.date);
	}

	const targetShops =
		openingsByShop.size > 0
			? shopUuids.filter((shopUuid) => openingsByShop.has(shopUuid))
			: shopUuids;

	const alerts: TempoAlertItem[] = [];
	for (const shopUuid of targetShops) {
		const openingHour = getOpeningHourMsk(shopUuid, openingsByShop);
		const elapsedHours = nowHour - openingHour + 1;
		if (elapsedHours <= 0) continue;

		const closeHour = 22;
		const totalHours = Math.max(1, closeHour - openingHour + 1);
		const planRevenue = Number(planByShop[shopUuid] || 0);
		if (!Number.isFinite(planRevenue) || planRevenue <= 0) continue;

		const docs = await getDocumentsFromIndexFirst(
			bindings.DB,
			evotor,
			shopUuid,
			`${dateIso}T00:00:00.000000+00:00`,
			`${dateIso}T23:59:59.000000+00:00`,
			{ types: ["SELL", "PAYBACK"], skipFetchIfStale: true },
		);

		let actualRevenue = 0;
		for (const doc of docs) {
			const isRefund = doc.type === "PAYBACK";
			for (const tx of doc.transactions || []) {
				if (tx.type !== "PAYMENT") continue;
				const amount = Number(tx.sum || 0);
				if (!Number.isFinite(amount) || amount === 0) continue;
				actualRevenue += isRefund ? -Math.abs(amount) : Math.abs(amount);
			}
		}

		const forecastRevenue = (actualRevenue / elapsedHours) * totalHours;
		const forecastPct = planRevenue > 0 ? (forecastRevenue / planRevenue) * 100 : 0;
		if (forecastRevenue >= planRevenue * thresholdRatio) continue;

		const alertBase = {
			shopUuid,
			shopName: shopNamesMap[shopUuid] || shopUuid,
			actualRevenue,
			planRevenue,
			forecastRevenue,
			planProgressPct: (actualRevenue / planRevenue) * 100,
			forecastPct,
			missingRevenue: Math.max(0, planRevenue - forecastRevenue),
			openingHour,
			elapsedHours,
			totalHours,
		};

		let recommendations = buildDefaultRecommendations({
			...alertBase,
			recommendations: [],
		});
		try {
			const aiRecommendations = await buildAiRecommendations(bindings, alertBase);
			if (aiRecommendations && aiRecommendations.length > 0) {
				recommendations = aiRecommendations;
			}
		} catch (error) {
			logger.warn("Tempo alert AI recommendations failed, using fallback", {
				shopUuid,
				error: error instanceof Error ? error.message : String(error),
			});
		}

		alerts.push({
			...alertBase,
			recommendations,
		});
	}

	if (alerts.length === 0) return;
	const text = buildTempoAlertText(alerts, nowMsk, thresholdPct);
	for (const alert of alerts) {
		try {
			await saveAiAlert(bindings.DB, {
				shopUuid: alert.shopUuid,
				alertType: "tempo_alert",
				severity: "warning",
				message: text,
			});
		} catch (error) {
			logger.warn("Failed to persist tempo alert", {
				shopUuid: alert.shopUuid,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	for (const sub of subscriptions) {
		try {
			await sendTelegramMessage(sub.chatId, text, bindings.BOT_TOKEN);
			await touchTgSubscriptionLastSentAt(db, sub.userId, sub.chatId);
		} catch (error) {
			logger.warn("Tempo alert telegram send failed", {
				chatId: sub.chatId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}
