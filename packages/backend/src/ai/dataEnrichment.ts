import type { SalesInfo } from "../evotor/types.js";

/**
 * Вычисляет агрегированные метрики по массиву salesInfo
 */
export function calculateSalesMetrics(salesInfo: SalesInfo[]) {
	let totalRevenue = 0;
	let totalCost = 0;
	const transactionsCount = salesInfo.length;

	for (const sale of salesInfo) {
		for (const tx of sale.transactions) {
			const revenue = tx.sum || 0;
			const cost = (tx.costPrice || 0) * (tx.quantity || 0);

			if (sale.type === "SALE") {
				totalRevenue += revenue;
				totalCost += cost;
			} else {
				// PAYBACK - вычитаем
				totalRevenue -= revenue;
				totalCost -= cost;
			}
		}
	}

	const averageCheck =
		transactionsCount > 0 ? totalRevenue / transactionsCount : 0;
	const totalMargin =
		totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0;

	return {
		totalRevenue,
		totalTransactions: transactionsCount,
		averageCheck,
		totalMargin,
	};
}

/**
 * Вычисляет топ-5 товаров по выручке
 */
export function calculateTopProducts(salesInfo: SalesInfo[]) {
	const productStats = new Map<
		string,
		{ revenue: number; quantity: number; cost: number }
	>();

	for (const sale of salesInfo) {
		if (sale.type !== "SALE") continue; // Учитываем только продажи

		for (const tx of sale.transactions) {
			const existing = productStats.get(tx.productName) || {
				revenue: 0,
				quantity: 0,
				cost: 0,
			};

			existing.revenue += tx.sum || 0;
			existing.quantity += tx.quantity || 0;
			existing.cost += (tx.costPrice || 0) * (tx.quantity || 0);

			productStats.set(tx.productName, existing);
		}
	}

	// Конвертируем в массив и сортируем по выручке
	const topProducts = Array.from(productStats.entries())
		.map(([productName, stats]) => ({
			productName,
			revenue: stats.revenue,
			quantity: stats.quantity,
			margin:
				stats.revenue > 0
					? ((stats.revenue - stats.cost) / stats.revenue) * 100
					: 0,
		}))
		.sort((a, b) => b.revenue - a.revenue)
		.slice(0, 5);

	return topProducts;
}

/**
 * Определяет контекст времени на основе даты
 */
export function getTimeContext(dateStr: string) {
	const date = new Date(dateStr);

	const daysOfWeek = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
	const dayOfWeek = daysOfWeek[date.getDay()];
	const isWeekend = date.getDay() === 0 || date.getDay() === 6;

	// Российские праздники (упрощённо)
	const holidays = [
		"01-01",
		"01-02",
		"01-03",
		"01-04",
		"01-05",
		"01-06",
		"01-07",
		"01-08", // Новый год
		"02-23", // День защитника Отечества
		"03-08", // Международный женский день
		"05-01", // Праздник Весны и Труда
		"05-09", // День Победы
		"06-12", // День России
		"11-04", // День народного единства
	];

	const monthDay = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
	const isHoliday = holidays.includes(monthDay);

	const month = date.getMonth() + 1;
	let season = "зима";
	if (month >= 3 && month <= 5) season = "весна";
	else if (month >= 6 && month <= 8) season = "лето";
	else if (month >= 9 && month <= 11) season = "осень";

	return {
		dayOfWeek,
		isWeekend,
		isHoliday,
		hour: date.getHours(),
		season,
	};
}

/**
 * Вычисляет даты для предыдущего периода той же длины
 */
export function getPreviousPeriodDates(
	startDate: string,
	endDate: string,
): { previousStart: string; previousEnd: string } {
	const start = new Date(startDate);
	const end = new Date(endDate);

	const periodLength = Math.ceil(
		(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
	);

	const previousEnd = new Date(start);
	previousEnd.setDate(previousEnd.getDate() - 1);

	const previousStart = new Date(previousEnd);
	previousStart.setDate(previousStart.getDate() - periodLength + 1);

	return {
		previousStart: previousStart.toISOString().split("T")[0],
		previousEnd: previousEnd.toISOString().split("T")[0],
	};
}
