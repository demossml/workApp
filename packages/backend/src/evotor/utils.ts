import {
	getDocumentsByCashOutcomeByPeriod,
	getDocumentsBySales,
	getDocumentsBySalesPeriod,
} from "../db/repositories/documents";
import { logger } from "../logger";
import { aggregateShopFinancialFromDocuments } from "../contracts/financialAggregation";

import type { D1Database } from "@cloudflare/workers-types";

/**
 * Получает данные по выплатам в магазине с разбивкой по категориям.
 *
 * @param {string[]} shopUuids - Список UUID магазинов.
 * @param {string} since - Начальная дата (в формате строки).
 * @param {string} until - Конечная дата (в формате строки).
 *
 * @returns {Promise<Record<string, Record<string, number>>>} - Данные по выплатам для каждого магазина с разбивкой по категориям.
 *
 * @throws {Error} - В случае ошибки при получении данных.
 */
export async function getDocumentsByCashOutcomeData(
	db: D1Database,
	evo: any,
	shopUuids: string[],
	since: string,
	until: string,
): Promise<Record<string, Record<string, number>>> {
	const paymentCategory: Record<number, string> = {
		1: "Инкассация",
		2: "Оплата поставщику",
		3: "Оплата услуг",
		4: "Аренда",
		5: "Заработная плата",
		6: "Прочее",
	};

	// Используем p-limit для ограничения количества параллельных запросов, например 5 одновременно
	const pLimit = (await import("p-limit")).default;
	const limit = pLimit(5);

	const results = await Promise.all(
		shopUuids.map((shopUuid) =>
			limit(async () => {
				const [shopName, cashOutcomeDocuments] = await Promise.all([
					evo.getShopName(shopUuid),
					getDocumentsByCashOutcomeByPeriod(db, shopUuid, since, until),
				]);

				const sumPaymentCategory: Record<string, number> = {};

				for (const doc of cashOutcomeDocuments) {
					for (const trans of doc.transactions) {
						if (trans.type === "CASH_OUTCOME") {
							const category = paymentCategory[trans.paymentCategoryId];
							if (category) {
								sumPaymentCategory[category] =
									(sumPaymentCategory[category] || 0) + trans.sum;
							}
						}
					}
				}

				return { shopName, sumPaymentCategory };
			}),
		),
	);

	const resultData: Record<string, Record<string, number>> = {};
	for (const { shopName, sumPaymentCategory } of results) {
		resultData[shopName] = sumPaymentCategory;
	}

	return resultData;
}

export async function getSalesgardenReportData(
	db: D1Database,
	evo: any,
	shopUuids: string[],
	since: string,
	until: string,
): Promise<{
	salesDataByShopName: Record<
		string,
		{
			sell: Record<string, number>;
			refund: Record<string, number>;
			totalSell: number;
			checksCount: number;
		}
	>;
	grandTotalSell: number;
	grandTotalRefund: number;
	totalChecks: number;
}> {
	const paymentTypeLabels: Record<string, string> = {
		CARD: "Банковской картой:",
		ADVANCE: "Предоплатой (зачетом аванса):",
		CASH: "Нал. средствами:",
		COUNTEROFFER: "Встречным предоставлением:",
		CREDIT: "Постоплатой (в кредит):",
		ELECTRON: "Безналичными средствами:",
		UNKNOWN: "Неизвестно. По-умолчанию:",
	};

	try {
		// Параллельно получаем документы и имена магазинов
		const [documentsByShop, shopNames] = await Promise.all([
			Promise.all(
				shopUuids.map(async (uuid) => ({
					uuid,
					docs: await getDocumentsBySalesPeriod(db, uuid, since, until),
				})),
			),
			Promise.all(shopUuids.map((uuid) => evo.getShopName(uuid))),
		]);

		// Создаем мапу uuid => имя магазина
		const shopNameMap = Object.fromEntries(
			shopUuids.map((uuid, i) => [uuid, shopNames[i]]),
		);

		const salesDataByShopName: Record<
			string,
			{
				sell: Record<string, number>;
				refund: Record<string, number>;
				totalSell: number;
				checksCount: number;
			}
		> = {};

		let grandTotalSell = 0;
		let grandTotalRefund = 0;
		let totalChecks = 0;

		for (const { uuid, docs } of documentsByShop) {
			const { sell, refund, totalSell, totalRefund, checksCount } =
				aggregateShopFinancialFromDocuments(docs, paymentTypeLabels);

			const shopName = shopNameMap[uuid] || uuid;
			salesDataByShopName[shopName] = {
				sell,
				refund,
				totalSell,
				checksCount,
			};
			grandTotalSell += totalSell;
			grandTotalRefund += totalRefund;
			totalChecks += checksCount;
		}

		console.log("[getSalesgardenReportData] Final totals:", {
			grandTotalSell,
			grandTotalRefund,
			netSales: grandTotalSell - grandTotalRefund,
			totalChecks,
			shopsCount: documentsByShop.length,
			shopNames: Object.keys(salesDataByShopName),
		});

		return {
			salesDataByShopName,
			grandTotalSell,
			grandTotalRefund,
			totalChecks,
		};
	} catch (error) {
		logger.error(
			`getSalesgardenReportData: Ошибка при получении данных для магазинов ${shopUuids.join(", ")}`,
			error,
		);
		throw error;
	}
}

/**
 * Получает данные о топ-продуктах за период
 */
export async function getTopProductsData(
	evo: any,
	shopUuids: string[],
	since: string,
	until: string,
) {
	try {
		const endDate = new Date(until);
		const dayKeys: string[] = [];
		for (let i = 6; i >= 0; i--) {
			const d = new Date(endDate);
			d.setDate(endDate.getDate() - i);
			dayKeys.push(d.toISOString().slice(0, 10));
		}
		const dayIndex = new Map(dayKeys.map((key, idx) => [key, idx]));

		const productStats = new Map<
			string,
			{
				revenue: number;
				quantity: number;
				refundRevenue: number;
				refundQuantity: number;
				cost: number;
				refundCost: number;
				dailyNetRevenue7: number[];
			}
		>();

		// Получаем документы для всех магазинов
		const docsPromises = shopUuids.map((uuid) =>
			evo.getDocumentsBySellPayback(uuid, since, until),
		);
		const docsResults = await Promise.all(docsPromises);

		// Обрабатываем все документы
		for (const docs of docsResults) {
			if (!docs || docs.length === 0) continue;

			for (const doc of docs) {
				const isRefund = doc.type === "PAYBACK";

				for (const trans of doc.transactions) {
					if (trans.type !== "REGISTER_POSITION") continue;

					const productName = trans.commodityName || "Неизвестный товар";
					const existing = productStats.get(productName) || {
						revenue: 0,
						quantity: 0,
						refundRevenue: 0,
						refundQuantity: 0,
						cost: 0,
						refundCost: 0,
						dailyNetRevenue7: [0, 0, 0, 0, 0, 0, 0],
					};
					const lineCost =
						Number(trans.costPrice || 0) * Number(trans.quantity || 0);
					const dayKey = new Date(doc.closeDate).toISOString().slice(0, 10);
					const idx = dayIndex.get(dayKey);

					if (isRefund) {
						existing.refundRevenue += trans.sum || 0;
						existing.refundQuantity += trans.quantity || 0;
						existing.refundCost += lineCost;
						if (typeof idx === "number") {
							existing.dailyNetRevenue7[idx] -= Number(trans.sum || 0);
						}
					} else {
						existing.revenue += trans.sum || 0;
						existing.quantity += trans.quantity || 0;
						existing.cost += lineCost;
						if (typeof idx === "number") {
							existing.dailyNetRevenue7[idx] += Number(trans.sum || 0);
						}
					}

					productStats.set(productName, existing);
				}
			}
		}

		// Конвертируем в массив и сортируем по чистой выручке
		const topProducts = Array.from(productStats.entries())
			.map(([productName, stats]) => {
				const netRevenue = stats.revenue - stats.refundRevenue;
				const grossProfit = netRevenue - (stats.cost - stats.refundCost);
				return {
					productName,
					revenue: stats.revenue,
					quantity: stats.quantity,
					refundRevenue: stats.refundRevenue,
					refundQuantity: stats.refundQuantity,
					netRevenue,
					netQuantity: stats.quantity - stats.refundQuantity,
					grossProfit,
					marginPct: netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0,
					averagePrice: stats.quantity > 0 ? stats.revenue / stats.quantity : 0,
					refundRate:
						stats.revenue > 0 ? (stats.refundRevenue / stats.revenue) * 100 : 0,
					dailyNetRevenue7: stats.dailyNetRevenue7,
				};
			})
			.filter((p) => p.netRevenue > 0) // Только товары с положительной выручкой
			.sort((a, b) => b.netRevenue - a.netRevenue);

		return topProducts;
	} catch (error) {
		logger.error("Ошибка при получении топ-продуктов:", error);
		throw error;
	}
}

interface ChartPoint {
	time: string; // ISO-строка времени (с +3 часами)
	value: number; // сумма продаж
}

interface ShopChartData {
	shopName: string;
	data: ChartPoint[];
}

export async function getSalesDataG(
	db: D1Database,
	evo: any,
	shopUuids: string[],
	since: string,
	until: string,
): Promise<ShopChartData[]> {
	try {
		// console.log("⏳ Запрос данных о продажах...");
		// console.log(`🛍 Магазины: ${shopUuids.join(", ")}`);
		// console.log(`📅 Период: с ${since} по ${until}`);

		// Параллельно получаем документы и названия магазинов
		const [documentsByShop, shopNames] = await Promise.all([
			Promise.all(
				shopUuids.map(async (uuid) => {
					const docs = await getDocumentsBySales(db, uuid, since, until);
					logger.debug(
						`📄 Получено ${docs.length} документов для магазина ${uuid}`,
					);
					// Логируем структуру первого документа для отладки
					// if (docs.length > 0) {
					// 	console.log(
					// 		`📝 Структура первого документа: ${JSON.stringify(docs[0], null, 2)}`,
					// 	);
					// }
					return docs;
				}),
			),
			Promise.all(
				shopUuids.map(async (uuid) => {
					const name = await evo.getShopName(uuid);
					// console.log(`🏪 Название магазина ${uuid}: ${name || "Неизвестно"}`);
					return name || `Магазин ${uuid}`; // Запасное имя
				}),
			),
		]);

		const chartData: ShopChartData[] = [];

		for (let i = 0; i < shopUuids.length; i++) {
			const shopName = shopNames[i];
			const docs = documentsByShop[i] || []; // Защита от undefined

			// console.log(`📊 Обработка ${docs.length} документов для "${shopName}"`);

			const data: ChartPoint[] = docs
				.map((doc: any, index: number) => {
					// Проверка наличия документа
					if (!doc) {
						logger.warn(
							`⚠️ Пропущен документ ${index + 1} для "${shopName}" — документ отсутствует`,
						);
						return null;
					}

					// Используем closeDate как основное поле для времени
					const timestamp = doc.closeDate;
					if (!timestamp) {
						logger.warn(
							`⚠️ Пропущен документ ${index + 1} для "${shopName}" — отсутствует closeDate`,
						);
						return null;
					}

					const originalDate = new Date(timestamp);
					// Проверка валидности даты
					if (originalDate.toString() === "Invalid Date") {
						logger.warn(
							`⚠️ Пропущен документ ${index + 1} для "${shopName}" — некорректная дата: ${timestamp}`,
						);
						return null;
					}

					// Поиск транзакции DOCUMENT_CLOSE_FPRINT для получения total
					const closeFprint = doc.transactions?.find(
						(tx: any) => tx.type === "DOCUMENT_CLOSE_FPRINT",
					);
					if (
						!closeFprint ||
						typeof closeFprint.total !== "number" ||
						Number.isNaN(closeFprint.total)
					) {
						logger.warn(
							`⚠️ Пропущен документ ${index + 1} для "${shopName}" — отсутствует или некорректный total в DOCUMENT_CLOSE_FPRINT`,
						);
						return null;
					}

					// Сдвиг времени на +3 часа
					const shifted = new Date(originalDate.getTime());
					const value = closeFprint.total;

					// console.log(
					// 	`  ▶️ Документ ${index + 1}: time=${originalDate.toISOString()} (+3h=${shifted.toISOString()}), total=${value}`,
					// );

					return {
						time: shifted.toISOString(),
						value,
					};
				})
				.filter((item): item is ChartPoint => item !== null); // Типобезопасная фильтрация

			chartData.push({
				shopName,
				data,
			});
		}

		// console.log("✅ Данные о продажах успешно собраны");

		return chartData;
	} catch (error) {
		logger.error(
			`❌ getSalesData: Ошибка при получении данных о продажах для магазинов ${shopUuids.join(", ")}`,
			error,
		);
		throw error;
	}
}
/**
 * Получает документы типа "SELL"/"PAYBACK" и вычисляет общую сумму продаж и количество товаров.
 *
 * @param db - База данных D1.
 * @param shopId - ID магазина.
 * @param since - Дата начала периода.
 * @param until - Дата окончания периода.
 * @param productUuids - UUID товаров, по которым ведётся подсчёт.
 * @returns Объект с общей суммой продаж и количеством по каждому товару.
 * @throws В случае ошибки при запросе или расчётах.
 */
// export async function getSalesStats(
// 	db: D1Database,
// 	shopId: string,
// 	since: string,
// 	until: string,
// 	productUuids: string[],
// ): Promise<SalesStats> {
// 	try {
// 		const documents = await getDocumentsBySalesPeriod(db, shopId, since, until);

// 		let totalSum = 0;
// 		const quantityByProduct: Record<string, number> = {};
// 		const productUuidSet = new Set(productUuids); // Быстрый доступ

// 		for (const doc of documents) {
// 			for (const trans of doc.transactions) {
// 				if (
// 					trans.type === "REGISTER_POSITION" &&
// 					productUuidSet.has(trans.commodityUuid)
// 				) {
// 					totalSum += trans.sum;

// 					const name = trans.commodityName;
// 					quantityByProduct[name] =
// 						(quantityByProduct[name] ?? 0) + trans.quantity;
// 				}
// 			}
// 		}

// 		return { totalSum, quantityByProduct };
// 	} catch (error) {
// 		console.error(
// 			`Ошибка при получении и расчете продаж для магазина с ID: ${shopId}`,
// 			error,
// 		);
// 		throw error;
// 	}
// }
