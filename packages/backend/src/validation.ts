import { z } from "zod";
import { ApiError } from "./errors";
import { APP_EVENT_NAMES } from "./analytics/events";

/**
 * Схемы валидации для входных данных API
 * Используйте эти схемы для проверки данных от клиента
 */

// ============================================
// БАЗОВЫЕ ТИПЫ
// ============================================

export const UuidSchema = z.string().uuid("Некорректный UUID");

export const DateStringSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Дата должна быть в формате YYYY-MM-DD");

export const DateDDMMYYYYSchema = z
	.string()
	.regex(/^\d{2}-\d{2}-\d{4}$/, "Дата должна быть в формате DD-MM-YYYY");

export const TelegramUserIdSchema = z
	.string()
	.min(1, "ID пользователя не может быть пустым")
	.max(20, "Некорректный ID пользователя");

/**
 * Schema for AI Insights request
 */
export const AiInsightsRequestSchema = z.object({
	startDate: DateStringSchema,
	endDate: DateStringSchema,
	shopUuid: UuidSchema,
});

/**
 * Schema for procurement recommendations request
 */
export const ProcurementRecommendationsSchema = z.object({
	shopUuid: UuidSchema,
	groups: z.array(UuidSchema).min(1, "Не выбраны товарные группы"),
	startDate: DateStringSchema,
	endDate: DateStringSchema,
	coverDays: z.number().int().min(1).max(30).optional(),
	minStockDays: z.number().int().min(1).max(30).optional(),
});

/**
 * Schema for employee and shift KPI request
 */
export const EmployeeShiftKpiSchema = z.object({
	shopUuid: UuidSchema,
	startDate: DateStringSchema,
	endDate: DateStringSchema,
});

/**
 * POST /api/ai/opening-photo-digest
 */
export const OpeningPhotoDigestRequestSchema = z.object({
	date: DateStringSchema.optional(),
});

/**
 * POST /api/ai/director/summary
 */
export const AiDirectorSummaryRequestSchema = z.object({
	date: DateStringSchema.optional(),
	shopUuids: z.array(UuidSchema).min(1).optional(),
	avgDays: z.coerce.number().int().min(1).max(31).optional(),
});

/**
 * POST /api/ai/director/alerts
 */
export const AiDirectorAlertsRequestSchema = z.object({
	date: DateStringSchema.optional(),
	shopUuids: z.array(UuidSchema).min(1).optional(),
	salesDropThresholdPct: z.coerce.number().min(1).max(100).optional(),
	categoryDropThresholdPct: z.coerce.number().min(1).max(100).optional(),
	minCategoryRevenue: z.coerce.number().min(0).max(1000000000).optional(),
});

/**
 * POST /api/ai/director/forecast
 */
export const AiDirectorForecastRequestSchema = z.object({
	date: DateStringSchema.optional(),
	shopUuids: z.array(UuidSchema).min(1).optional(),
	openHour: z.coerce.number().int().min(0).max(23).optional(),
	workingHoursWeekday: z.coerce.number().int().min(1).max(24).optional(),
	workingHoursWeekend: z.coerce.number().int().min(1).max(24).optional(),
});

/**
 * POST /api/ai/director/velocity
 */
export const AiDirectorVelocityRequestSchema = z.object({
	since: DateStringSchema,
	until: DateStringSchema,
	shopUuids: z.array(UuidSchema).min(1).optional(),
	workingHoursWeekday: z.coerce.number().int().min(1).max(24).optional(),
	workingHoursWeekend: z.coerce.number().int().min(1).max(24).optional(),
	limit: z.coerce.number().int().min(1).max(500).optional(),
});

/**
 * POST /api/ai/director/recommendations
 */
export const AiDirectorRecommendationsRequestSchema = z.object({
	since: DateStringSchema,
	until: DateStringSchema,
	shopUuids: z.array(UuidSchema).min(1).optional(),
	planningDays: z.coerce.number().int().min(1).max(60).optional(),
	deadStockDays: z.coerce.number().int().min(7).max(180).optional(),
	lookbackDays: z.coerce.number().int().min(7).max(365).optional(),
	limit: z.coerce.number().int().min(1).max(500).optional(),
});

/**
 * POST /api/ai/director/report
 */
export const AiDirectorReportRequestSchema = z.object({
	date: DateStringSchema.optional(),
	shopUuids: z.array(UuidSchema).min(1).optional(),
	sendTelegram: z.boolean().optional(),
});

/**
 * POST /api/ai/director/chat
 */
export const AiDirectorChatRequestSchema = z.object({
	message: z.string().min(1).max(2000),
	date: DateStringSchema.optional(),
	since: DateStringSchema.optional(),
	until: DateStringSchema.optional(),
	shopUuids: z.array(UuidSchema).min(1).optional(),
});

/**
 * POST /api/ai/director/store-rating
 */
export const AiDirectorStoreRatingRequestSchema = z.object({
	date: DateStringSchema.optional(),
	since: DateStringSchema.optional(),
	until: DateStringSchema.optional(),
	shopUuids: z.array(UuidSchema).min(1).optional(),
});

/**
 * POST /api/ai/director/employee-analysis
 */
export const AiDirectorEmployeeAnalysisRequestSchema = z.object({
	since: DateStringSchema.optional(),
	until: DateStringSchema.optional(),
	shopUuids: z.array(UuidSchema).min(1).optional(),
	limit: z.coerce.number().int().min(1).max(500).optional(),
});

/**
 * POST /api/ai/director/employee-deep-analysis
 */
export const AiDirectorEmployeeDeepAnalysisRequestSchema = z.object({
	since: DateStringSchema.optional(),
	until: DateStringSchema.optional(),
	shopUuids: z.array(UuidSchema).min(1).optional(),
	employeeUuids: z.array(z.string().min(1)).min(1).optional(),
	limit: z.coerce.number().int().min(1).max(500).optional(),
	analysisDepth: z.enum(["lite", "standard", "deep"]).optional(),
	historyDays: z.coerce.number().int().min(14).max(365).optional(),
	focusAreas: z
		.array(
			z.enum([
				"revenue_trend",
				"avg_check",
				"refunds",
				"traffic",
				"peer_comparison",
				"stability",
			]),
		)
		.min(1)
		.optional(),
	riskSensitivity: z.enum(["low", "normal", "high"]).optional(),
});

/**
 * POST /api/ai/director/demand-forecast
 */
export const AiDirectorDemandForecastRequestSchema = z.object({
	date: DateStringSchema.optional(),
	shopUuids: z.array(UuidSchema).min(1).optional(),
});

/**
 * POST /api/ai/director/explain-sales
 */
export const AiDirectorExplainSalesRequestSchema = z.object({
	date: DateStringSchema.optional(),
	shopUuids: z.array(UuidSchema).min(1).optional(),
});

/**
 * POST /api/ai/director/heatmap
 */
export const AiDirectorHeatmapRequestSchema = z.object({
	shopUuids: z.array(UuidSchema).min(1).optional(),
});

/**
 * POST /api/ai/director/stock-monitor
 */
export const AiDirectorStockMonitorRequestSchema = z.object({
	since: DateStringSchema.optional(),
	until: DateStringSchema.optional(),
	shopUuids: z.array(UuidSchema).min(1).optional(),
	limit: z.coerce.number().int().min(1).max(500).optional(),
});

/**
 * POST /api/ai/dashboard-summary2-insights
 */
const DashboardSummary2RiskShopSchema = z.object({
	shopName: z.string().min(1).max(128),
	risk: z.number().min(0).max(100),
	progress: z.number().min(0).max(500),
	missing: z.number().min(0),
});

const DashboardSummary2IncidentSchema = z.object({
	shopName: z.string().min(1).max(128),
	type: z.string().min(1).max(64),
	details: z.string().min(1).max(500),
	severity: z.number().min(0).max(1000),
});

const DashboardSummary2LossSchema = z.object({
	productName: z.string().min(1).max(256),
	lostQty: z.number().min(0).max(1000000),
	lostRevenue: z.number().min(0).max(1000000000),
});

export const DashboardSummary2InsightsRequestSchema = z.object({
	since: DateStringSchema,
	until: DateStringSchema,
	metrics: z.object({
		networkRisk: z.number().min(0).max(100),
		redShops: z.array(DashboardSummary2RiskShopSchema).max(10),
		salesDeltaPct: z.number().min(-1000).max(1000),
		checksDeltaPct: z.number().min(-1000).max(1000),
		avgCheckDeltaPct: z.number().min(-1000).max(1000),
		refundRate: z.number().min(0).max(100),
		refundDeltaPp: z.number().min(-100).max(100),
		forecast: z.object({
			value: z.number().min(0).max(1000000000),
			lower: z.number().min(0).max(1000000000),
			upper: z.number().min(0).max(1000000000),
			confidence: z.number().min(0).max(100),
		}),
		incidents: z.array(DashboardSummary2IncidentSchema).max(12),
		losses: z.array(DashboardSummary2LossSchema).max(10),
	}),
});

export const DashboardHomeInsightsRequestSchema = z.object({
	since: DateStringSchema,
	until: DateStringSchema,
	dateMode: z.enum(["today", "yesterday", "period"]).optional(),
	shopUuid: UuidSchema.optional(),
});

/**
 * POST /api/stores/openings-report
 */
export const OpeningsReportSchema = z.object({
	startDate: DateStringSchema.optional(),
	endDate: DateStringSchema.optional(),
});

// ============================================
// СХЕМЫ ДЛЯ ENDPOINTS
// ============================================

/**
 * POST /api/employee/and-store/name-uuid
 */
export const EmployeeByShopSchema = z.object({
	shop: UuidSchema,
});

/**
 * POST /api/schedules/table
 */
export const SchedulesTableSchema = z.object({
	month: z.number().int().min(1).max(12),
	year: z.number().int().min(2020).max(2100),
	schedules: z.any(), // Любая структура, так как transformScheduleDataD принимает разные форматы
});

/**
 * POST /api/schedules/table-view
 */
export const SchedulesTableViewSchema = z.object({
	month: z.number().int().min(1).max(12),
	year: z.number().int().min(2020).max(2100),
	shopId: UuidSchema,
});

/**
 * POST /api/get-file
 */
export const GetFileSchema = z.object({
	date: DateStringSchema,
	shop: UuidSchema,
});

/**
 * POST /api/register
 */
export const RegisterSchema = z.object({
	userId: TelegramUserIdSchema,
});

/**
 * POST /api/evotor/groups-by-shop
 */
export const GroupsByShopSchema = z.object({
	shopUuid: UuidSchema,
});

/**
 * POST /api/evotor/salary
 */
export const SalarySchema = z.object({
	employee: z.string().min(1, "employee обязателен"),
	startDate: DateStringSchema,
	endDate: DateStringSchema,
});

/**
 * POST /api/evotor/submit-groups
 */
export const SubmitGroupsSchema = z.object({
	groups: z.array(UuidSchema),
	salary: z.number().nonnegative(),
	bonus: z.number().nonnegative(),
});

/**
 * POST /api/evotor/settings/accessory-groups
 */
export const AccessoryGroupsSaveSchema = z.object({
	groups: z.array(UuidSchema),
});

/**
 * POST /api/evotor/settings/salary-bonus
 */
export const SalaryBonusSaveSchema = z.object({
	salary: z.number().nonnegative(),
	bonus: z.number().nonnegative(),
});

/**
 * POST /api/evotor/sales-result
 */
export const SalesResultSchema = z.object({
	startDate: DateStringSchema,
	endDate: DateStringSchema,
	shopUuid: UuidSchema,
	groups: z.array(UuidSchema),
});

/**
 * POST /api/evotor/dead-stock
 */
export const DeadStockSchema = z.object({
	startDate: DateStringSchema,
	endDate: DateStringSchema,
	shopUuid: UuidSchema,
	groups: z.array(UuidSchema),
});

/**
 * POST /api/evotor/stock-report
 */
export const StockReportSchema = z.object({
	shopUuid: UuidSchema,
	groups: z.array(UuidSchema),
});

/**
 * POST /api/evotor/order
 */
export const OrderSchema = z.object({
	startDate: DateStringSchema,
	endDate: DateStringSchema,
	shopUuid: UuidSchema,
	groups: z.array(UuidSchema),
	period: z.number().int().positive(),
});

/**
 * POST /api/evotor/order-v2
 */
export const OrderV2Schema = z.object({
	startDate: DateStringSchema,
	endDate: DateStringSchema,
	shopUuid: UuidSchema,
	groups: z.array(UuidSchema).min(1),
	forecastHorizonDays: z.coerce.number().int().min(1).max(60).optional(),
	leadTimeDays: z.coerce.number().int().min(1).max(30).optional(),
	serviceLevel: z.union([z.literal(0.8), z.literal(0.9), z.literal(0.95), z.literal(0.98)]).optional(),
	budgetLimit: z.coerce.number().min(0).optional(),
});

/**
 * POST /api/evotor/sales-garden-report
 */
export const SalesGardenReportSchema = z.object({
	startDate: DateStringSchema,
	endDate: DateStringSchema,
});

/**
 * POST /api/profit-report
 */
export const ProfitReportSchema = z.object({
	shopUuids: z.array(UuidSchema),
	since: z.string().min(1),
	until: z.string().min(1),
	dataFrom1C: z.record(
		z.object({
			expenses: z.number().nonnegative(),
			grossProfit: z.number(),
		}),
	),
});

export const ProfitReportSnapshotBodySchema = z.object({
	period: z.object({
		since: z.string().min(1),
		until: z.string().min(1),
	}),
	report: z.record(
		z.object({
			byCategory: z.record(z.number()),
			totalEvoExpenses: z.number(),
			expenses1C: z.number(),
			grossProfit: z.number(),
			netProfit: z.number(),
		}),
	),
});

export const ProfitReportSnapshotsListSchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const ProfitReportSnapshotIdSchema = z.object({
	id: z.coerce.number().int().positive(),
});

/**
 * POST /api/is-open-store
 */
export const IsOpenStoreSchema = z.object({
	userId: TelegramUserIdSchema,
	date: DateDDMMYYYYSchema,
	shopUuid: UuidSchema,
});

/**
 * POST /api/open-store
 */
export const OpenStoreSchema = z.object({
	userId: TelegramUserIdSchema,
	shopUuid: UuidSchema,
	date: DateDDMMYYYYSchema,
	timestamp: z.string().datetime("Некорректный формат timestamp"),
	userName: z.string().min(1).optional(),
});

/**
 * POST /api/finish-opening
 */
export const FinishOpeningSchema = z.object({
	userId: TelegramUserIdSchema,
	shopUuid: UuidSchema,
	ok: z.boolean().nullable(),
	discrepancy: z
		.object({
			amount: z.union([z.string(), z.number()]),
			type: z.enum(["+", "-"]),
		})
		.nullable()
		.optional(),
});

export const ShopsOpeningStatusSchema = z.object({
	date: DateDDMMYYYYSchema,
});

export const OpeningPhotosSchema = z.object({
	shopUuid: UuidSchema,
	userId: TelegramUserIdSchema,
	openedAt: z.string().min(1, "openedAt обязателен"),
});

/**
 * POST /api/save-dead-stocks
 */
export const SaveDeadStocksSchema = z.object({
	shopUuid: UuidSchema,
	items: z.array(
		z.object({
			name: z.string().min(1),
			quantity: z.number().int().nonnegative(),
			sold: z.number().int().nonnegative(),
			lastSaleDate: z.string().nullable(),
			mark: z
				.enum(["keep", "move", "sellout", "writeoff"])
				.nullable()
				.optional(),
			moveCount: z.number().int().nonnegative().optional(),
			moveToStore: z.string().optional(),
		}),
	),
});

export const AnalyticsEventSchema = z.object({
	eventName: z.enum(APP_EVENT_NAMES),
	userId: TelegramUserIdSchema.optional(),
	shopUuid: UuidSchema.optional(),
	role: z.string().min(1).max(64).optional(),
	screen: z.string().min(1).max(128).optional(),
	traceId: z.string().min(1).max(128).optional(),
	props: z.record(z.unknown()).optional(),
	appVersion: z.string().min(1).max(64).optional(),
});

const AlertSettingsSchema = z.object({
	openingDeadline: z
		.string()
		.regex(/^\d{2}:\d{2}$/, "openingDeadline должен быть в формате HH:mm")
		.optional(),
	refundThresholdPct: z.number().min(0).max(100).optional(),
	revenueDropThresholdPct: z.number().min(0).max(100).optional(),
});

export const TelegramSubscribeSchema = z.object({
	userId: TelegramUserIdSchema.optional(),
	chatId: z.string().min(1).optional(),
	writeAccess: z.boolean().optional(),
	settings: AlertSettingsSchema.optional(),
});

export const TelegramUnsubscribeSchema = z.object({
	userId: TelegramUserIdSchema.optional(),
	chatId: z.string().min(1).optional(),
});

// ============================================
// HELPER ФУНКЦИИ
// ============================================

/**
 * Валидирует данные и возвращает результат или выбрасывает ошибку с читаемым сообщением
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
	const result = schema.safeParse(data);
	if (!result.success) {
		const errors = result.error.errors.map((e) => ({
			field: e.path.join("."),
			message: e.message,
		}));
		throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", {
			errors,
		});
	}
	return result.data;
}

/**
 * Возвращает безопасный результат валидации без выброса ошибки
 */
export function safeValidate<T>(
	schema: z.ZodSchema<T>,
	data: unknown,
): { success: true; data: T } | { success: false; errors: string[] } {
	const result = schema.safeParse(data);
	if (!result.success) {
		return {
			success: false,
			errors: result.error.errors.map(
				(e) => `${e.path.join(".")}: ${e.message}`,
			),
		};
	}
	return { success: true, data: result.data };
}
