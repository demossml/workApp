import { z } from "zod";

// ─── Входящий запрос из 1С ────────────────────────────────────────────────────

const OnecPriceItemSchema = z.object({
	sku:        z.string().min(1, "sku не может быть пустым").max(100),
	barcode:    z.string().max(20).nullable().optional(),
	name:       z.string().max(500).nullable().optional(),
	price:      z.number().positive("price должен быть больше 0"),
	price_type: z.string().optional(), // тип цены на уровне позиции (если передаётся)
	store:      z.string().optional(), // магазин на уровне позиции (если передаётся)
	changed_at: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, "changed_at должен быть YYYY-MM-DD")
		.nullable()
		.optional(),
});

export const OnecPricesPayloadSchema = z.object({
	store:           z.string().min(1, "store обязателен").max(50).regex(
		/^[\w\-]+$/,
		"store: только латиница, цифры, дефис, подчёркивание",
	),
	sku_source:      z.string().optional(), // дубль store для совместимости
	date:            z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, "date должен быть YYYY-MM-DD"),
	exported_at:     z.string().optional(),
	price_type:      z.enum(["purchase", "retail", "wholesale"], {
		errorMap: () => ({ message: "price_type: purchase | retail | wholesale" }),
	}),
	price_type_name: z.string().optional(),
	total_processed: z.number().int().nonnegative().optional(),
	items_count:     z.number().int().nonnegative().optional(),
	last_export:     z.string().optional(),
	items:           z
		.array(OnecPriceItemSchema)
		.min(1, "items не может быть пустым")
		.max(10_000, "items: максимум 10 000 позиций в запросе"),
});

export type OnecPricesPayload = z.infer<typeof OnecPricesPayloadSchema>;

// ─── Query-параметры для GET /api/1c/prices ──────────────────────────────────

export const OnecGetPricesQuerySchema = z.object({
	store:         z.string().optional(),
	price_type:    z.enum(["purchase", "retail", "wholesale"]).optional(),
	sku:           z.string().optional(),
	name:          z.string().optional(),
	updated_since: z.string().optional(),
	page:          z.coerce.number().int().min(1).default(1),
	limit:         z.coerce.number().int().min(1).max(500).default(50),
});

// ─── Query-параметры для GET /api/1c/prices/:sku ─────────────────────────────

export const OnecGetPriceBySkuQuerySchema = z.object({
	store:      z.string().optional(),
	price_type: z.enum(["purchase", "retail", "wholesale"]).optional(),
});

// ─── Query-параметры для GET /api/1c/prices/:sku/history ─────────────────────

export const OnecGetPriceHistoryQuerySchema = z.object({
	store: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(200).default(50),
});

// ─── Query-параметры для GET /api/1c/import-log ──────────────────────────────

export const OnecImportLogQuerySchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(20),
});
