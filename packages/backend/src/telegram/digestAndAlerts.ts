import { drizzle } from "drizzle-orm/d1";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { IEnv } from "../types";
import { Evotor } from "../evotor";
import { sendTelegramMessage } from "../../utils/sendTelegramMessage";
import {
	listActiveTgSubscriptions,
	touchTgSubscriptionLastSentAt,
	type TgSubscriptionSettings,
} from "../db/repositories/tgSubscriptions";
import { getPlan } from "../db/repositories/plan";
import { getOpeningsByDate } from "../db/repositories/openStores";
import { saveAppEvent } from "../db/repositories/appEvents";
import { getDocumentsFromIndexFirst } from "../services/indexDocumentsFallback";

interface ShopDayMetrics {
	shopUuid: string;
	shopName: string;
	revenue: number;
	refunds: number;
	checks: number;
}

function formatDateISO(date: Date): string {
	const y = date.getUTCFullYear();
	const m = String(date.getUTCMonth() + 1).padStart(2, "0");
	const d = String(date.getUTCDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

function formatDateDDMMYYYY(date: Date): string {
	const d = String(date.getUTCDate()).padStart(2, "0");
	const m = String(date.getUTCMonth() + 1).padStart(2, "0");
	const y = date.getUTCFullYear();
	return `${d}-${m}-${y}`;
}

function parseDeadlineToMinutes(value: string): number {
	const [h, m] = value.split(":").map(Number);
	return h * 60 + m;
}

function nowWithOffset(offsetMinutes: number) {
	return new Date(Date.now() + offsetMinutes * 60_000);
}

async function getShopDayMetrics(
	db: IEnv["Bindings"]["DB"],
	evotor: Evotor,
	dateIso: string,
): Promise<ShopDayMetrics[]> {
	const since = `${dateIso}T00:00:00.000000+00:00`;
	const until = `${dateIso}T23:59:59.000000+00:00`;
	const shopUuids = await evotor.getShopUuids();
	const shopNamesMap = await evotor.getShopNamesByUuids(shopUuids);

	return Promise.all(
		shopUuids.map(async (shopUuid) => {
			const documents = await getDocumentsFromIndexFirst(
				db,
				evotor,
				shopUuid,
				since,
				until,
				{ types: ["SELL", "PAYBACK"] },
			);
			let revenue = 0;
			let refunds = 0;
			let checks = 0;
			for (const doc of documents) {
				const isRefund = doc.type === "PAYBACK";
				checks += 1;
				for (const tx of doc.transactions || []) {
					if (tx.type !== "PAYMENT") continue;
					const amount = Math.abs(tx.sum || 0);
					if (isRefund) refunds += amount;
					else revenue += amount;
				}
			}
			return {
				shopUuid,
				shopName: shopNamesMap[shopUuid] || shopUuid,
				revenue,
				refunds,
				checks,
			};
		}),
	);
}

function topProblems(problems: string[], limit = 3) {
	return problems.slice(0, limit);
}

async function logTelegramEvent(
	db: DrizzleD1Database<Record<string, unknown>>,
	eventName: "telegram_digest_sent" | "telegram_digest_failed",
	props: Record<string, unknown>,
) {
	await saveAppEvent(db, {
		eventName,
		props,
	});
}

export async function runDailyTelegramDigestAndAlerts(bindings: IEnv["Bindings"]) {
	const db = drizzle(bindings.DB);
	const evotor = new Evotor(bindings.EVOTOR_API_TOKEN, bindings.KV);
	const subscriptions = await listActiveTgSubscriptions(db);
	if (subscriptions.length === 0) return;

	const tzOffsetMinutes = Number(bindings.ALERT_TZ_OFFSET_MINUTES ?? 180);
	const nowLocal = nowWithOffset(tzOffsetMinutes);
	const localMinutes = nowLocal.getUTCHours() * 60 + nowLocal.getUTCMinutes();

	const todayLocal = new Date(nowLocal);
	const yesterdayLocal = new Date(nowLocal);
	yesterdayLocal.setUTCDate(yesterdayLocal.getUTCDate() - 1);
	const prevLocal = new Date(nowLocal);
	prevLocal.setUTCDate(prevLocal.getUTCDate() - 2);

	const todayDDMM = formatDateDDMMYYYY(todayLocal);
	const yesterdayDDMM = formatDateDDMMYYYY(yesterdayLocal);
	const yesterdayISO = formatDateISO(yesterdayLocal);
	const prevISO = formatDateISO(prevLocal);

	const [yesterdayMetrics, prevMetrics, shops, openingsToday, planYesterday] =
		await Promise.all([
			getShopDayMetrics(bindings.DB, evotor, yesterdayISO),
			getShopDayMetrics(bindings.DB, evotor, prevISO),
			evotor.getShopNameUuids(),
			getOpeningsByDate(bindings.DB, todayDDMM),
			getPlan(yesterdayDDMM, bindings.DB),
		]);

	const prevByShop = new Map(prevMetrics.map((x) => [x.shopUuid, x]));
	const shopsList = shops || [];
	const openedSet = new Set(openingsToday.map((x) => x.shopUuid));

	for (const sub of subscriptions) {
		const settings = (sub.settingsJson
			? (JSON.parse(sub.settingsJson) as TgSubscriptionSettings)
			: {}) || { };
		const openingDeadline = settings.openingDeadline || "09:00";
		const refundThresholdPct = settings.refundThresholdPct ?? Number(bindings.ALERT_REFUND_THRESHOLD_PCT ?? 15);
		const revenueDropThresholdPct =
			settings.revenueDropThresholdPct ??
			Number(bindings.ALERT_REVENUE_DROP_THRESHOLD_PCT ?? 20);

		const problems: string[] = [];

		const deadlineMinutes = parseDeadlineToMinutes(openingDeadline);
		if (localMinutes >= deadlineMinutes) {
			const notOpened = shopsList
				.filter((shop) => !openedSet.has(shop.uuid))
				.map((shop) => shop.name);
			if (notOpened.length > 0) {
				problems.push(
					`Не открыты до ${openingDeadline}: ${notOpened.slice(0, 5).join(", ")}${notOpened.length > 5 ? ` (+${notOpened.length - 5})` : ""}`,
				);
			}
		}

		for (const row of yesterdayMetrics) {
			if (row.revenue <= 0) continue;
			const refundPct = (row.refunds / row.revenue) * 100;
			if (refundPct > refundThresholdPct) {
				problems.push(
					`Высокие возвраты ${row.shopName}: ${refundPct.toFixed(1)}% (> ${refundThresholdPct}%)`,
				);
			}
		}

		for (const row of yesterdayMetrics) {
			const prev = prevByShop.get(row.shopUuid);
			if (!prev || prev.revenue <= 0) continue;
			const dropPct = ((prev.revenue - row.revenue) / prev.revenue) * 100;
			if (dropPct > revenueDropThresholdPct) {
				problems.push(
					`Просадка выручки ${row.shopName}: -${dropPct.toFixed(1)}% д/д (> ${revenueDropThresholdPct}%)`,
				);
			}
		}

		const totalRevenue = yesterdayMetrics.reduce((acc, x) => acc + x.revenue, 0);
		const totalRefunds = yesterdayMetrics.reduce((acc, x) => acc + x.refunds, 0);
		const totalRefundPct = totalRevenue > 0 ? (totalRefunds / totalRevenue) * 100 : 0;

		const planTotal = Object.values(planYesterday || {}).reduce(
			(acc, x) => acc + Number(x || 0),
			0,
		);
		const planFactPct = planTotal > 0 ? (totalRevenue / planTotal) * 100 : null;

		const top3 = topProblems(problems, 3);
		const digestText =
			`📊 Ежедневный дайджест (${yesterdayDDMM})\n` +
			`Выручка вчера: ${Math.round(totalRevenue).toLocaleString("ru-RU")} ₽\n` +
			`Возвраты: ${Math.round(totalRefunds).toLocaleString("ru-RU")} ₽ (${totalRefundPct.toFixed(1)}%)\n` +
			`План-факт: ${planFactPct == null ? "н/д" : `${planFactPct.toFixed(1)}%`} ${planTotal > 0 ? `(план ${Math.round(planTotal).toLocaleString("ru-RU")} ₽)` : ""}\n` +
			`Проблемы:\n` +
			(top3.length > 0
				? top3.map((p, i) => `${i + 1}. ${p}`).join("\n")
				: "1. Критичных проблем не найдено");

		const alertsText =
			`🚨 Алерты (${formatDateDDMMYYYY(todayLocal)})\n` +
			`Правила:\n` +
			`• магазин не открыт до ${openingDeadline}\n` +
			`• возвраты > ${refundThresholdPct}%\n` +
			`• просадка выручки д/д > ${revenueDropThresholdPct}%\n\n` +
			(top3.length > 0
				? top3.map((p, i) => `${i + 1}. ${p}`).join("\n")
				: "Сработавших алертов нет.");

		try {
			await sendTelegramMessage(sub.chatId, digestText, bindings.BOT_TOKEN);
			await sendTelegramMessage(sub.chatId, alertsText, bindings.BOT_TOKEN);
			await touchTgSubscriptionLastSentAt(db, sub.userId, sub.chatId);
			await logTelegramEvent(db, "telegram_digest_sent", {
				userId: sub.userId,
				chatId: sub.chatId,
				problemsCount: problems.length,
			});
		} catch (error) {
			await logTelegramEvent(db, "telegram_digest_failed", {
				userId: sub.userId,
				chatId: sub.chatId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}
