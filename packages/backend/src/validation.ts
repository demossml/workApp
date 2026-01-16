import { z } from "zod";

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
	employee: UuidSchema,
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

/**
 * POST /api/is-open-store
 */
export const IsOpenStoreSchema = z.object({
	userId: TelegramUserIdSchema,
	date: DateDDMMYYYYSchema,
});

/**
 * POST /api/open-store
 */
export const OpenStoreSchema = z.object({
	userId: TelegramUserIdSchema,
	timestamp: z.string().datetime("Некорректный формат timestamp"),
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

// ============================================
// HELPER ФУНКЦИИ
// ============================================

/**
 * Валидирует данные и возвращает результат или выбрасывает ошибку с читаемым сообщением
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
	const result = schema.safeParse(data);
	if (!result.success) {
		const errors = result.error.errors
			.map((e) => `${e.path.join(".")}: ${e.message}`)
			.join(", ");
		throw new Error(`Ошибка валидации: ${errors}`);
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
