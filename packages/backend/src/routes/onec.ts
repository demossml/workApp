import { Hono } from "hono";
import type { IEnv } from "../types";
import { logger } from "../logger";
import { jsonError, toApiErrorPayload } from "../errors";
import { validate } from "../validation";
import {
	OnecPricesPayloadSchema,
	OnecGetPricesQuerySchema,
	OnecGetPriceBySkuQuerySchema,
	OnecGetPriceHistoryQuerySchema,
	OnecImportLogQuerySchema,
} from "../validation/onecPrices";
import {
	upsertPrices,
	getPrices,
	getPriceBySku,
	getPriceHistory,
	saveImportLog,
	getImportLogs,
	getOnecStats,
	type PriceItem,
} from "../db/repositories/onecPrices";
import { trackAppEvent } from "../analytics/track";

// ─── Middleware: проверка X-API-Key ──────────────────────────────────────────
//
// В wrangler.toml добавьте:
//   [vars]
//   ONEC_API_KEY = "ваш_секретный_ключ_минимум_32_символа"
//
// В IEnv (types.ts) добавьте в Bindings:
//   ONEC_API_KEY?: string;
//
// 1С передаёт заголовок:  X-API-Key: <значение ONEC_API_KEY>
//
// Если ONEC_API_KEY не задан в env — проверка пропускается (удобно для dev).

function checkApiKey(c: { env: IEnv["Bindings"]; req: { header: (k: string) => string | undefined } }) {
	const expected = c.env.ONEC_API_KEY;
	if (!expected) return true; // ключ не настроен — пропускаем

	const provided = c.req.header("x-api-key") ?? c.req.header("X-API-Key");
	return provided === expected;
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const onecRoutes = new Hono<IEnv>()

	// ── GET /ping — тест соединения из 1С ──────────────────────────────────
	// Кнопка «Тест соединения» в обработке ExportPricesPro вызывает этот endpoint.
	// Намеренно НЕ требует аутентификации — просто проверяет доступность сервера.
	.get("/ping", (c) => {
		return c.json({ status: "ok", version: "1.0.0", time: new Date().toISOString() });
	})

	// ── POST /prices — приём цен из 1С ─────────────────────────────────────
	.post("/prices", async (c) => {
		if (!checkApiKey(c)) {
			return jsonError(c, 401, "ONEC_UNAUTHORIZED", "Invalid or missing X-API-Key");
		}

		let store: string | undefined;
		let priceType: string | undefined;

		try {
			const raw  = await c.req.json();
			const body = validate(OnecPricesPayloadSchema, raw);

			store     = body.store;
			priceType = body.price_type;

			const drizzle = c.get("drizzle");

			// Приводим items к внутреннему формату
			const items: PriceItem[] = body.items.map((item) => ({
				sku:       item.sku,
				barcode:   item.barcode ?? null,
				name:      item.name ?? null,
				price:     item.price,
				priceType: body.price_type,           // берём из корня запроса
				store:     body.store,                // берём из корня запроса
				changedAt: item.changed_at ?? null,
			}));

			const result = await upsertPrices(drizzle, items);

			// Логируем успешный импорт
			await saveImportLog(drizzle, {
				store,
				priceType,
				itemsReceived: body.items.length,
				itemsInserted: result.inserted,
				itemsUpdated:  result.updated,
				itemsSkipped:  result.skipped,
				status:        "success",
			}).catch((err) => {
				logger.warn("1C: не удалось сохранить import_log", {
					error: err instanceof Error ? err.message : String(err),
				});
			});

			await trackAppEvent(c, "onec_prices_imported", {
				props: {
					store,
					price_type:    priceType,
					items_received: body.items.length,
					inserted:       result.inserted,
					updated:        result.updated,
				},
			}).catch(() => {});

			logger.debug("1C prices import success", {
				store,
				priceType,
				...result,
			});

			return c.json({
				status:       "ok",
				received:     body.items.length,
				inserted:     result.inserted,
				updated:      result.updated,
				skipped:      result.skipped,
				store,
				price_type:   priceType,
				processed_at: new Date().toISOString(),
			});

		} catch (error) {
			logger.error("1C prices import error", {
				store:     store ?? null,
				priceType: priceType ?? null,
				error:     error instanceof Error ? error.message : String(error),
			});

			// Пишем ошибку в лог
			try {
				await saveImportLog(c.get("drizzle"), {
					store,
					priceType,
					status:       "error",
					errorMessage: error instanceof Error ? error.message : String(error),
				});
			} catch {}

			const { status, body } = toApiErrorPayload(error, {
				code:    "ONEC_IMPORT_FAILED",
				message: "Ошибка при обработке данных из 1С",
			});
			return c.json(body, status as 200);
		}
	})

	// ── GET /prices — список актуальных цен с фильтрацией ──────────────────
	.get("/prices", async (c) => {
		try {
			const query  = validate(OnecGetPricesQuerySchema, c.req.query());
			const drizzle = c.get("drizzle");

			const result = await getPrices(drizzle, {
				store:        query.store,
				priceType:    query.price_type,
				sku:          query.sku,
				name:         query.name,
				updatedSince: query.updated_since,
				page:         query.page ?? 1,
				limit:        query.limit ?? 50,
			});

			return c.json(result);
		} catch (error) {
			const { status, body } = toApiErrorPayload(error, {
				code:    "ONEC_GET_PRICES_FAILED",
				message: "Ошибка при получении цен",
			});
			return c.json(body, status as 200);
		}
	})

	// ── GET /prices/store/:store — все цены конкретного магазина ───────────
	.get("/prices/store/:store", async (c) => {
		try {
			const store   = c.req.param("store");
			const query   = validate(OnecGetPricesQuerySchema, c.req.query());
			const drizzle = c.get("drizzle");

			const result = await getPrices(drizzle, {
				store,
				priceType: query.price_type,
				page:      query.page ?? 1,
				limit:     query.limit ?? 50,
			});

			return c.json(result);
		} catch (error) {
			const { status, body } = toApiErrorPayload(error, {
				code:    "ONEC_GET_STORE_PRICES_FAILED",
				message: "Ошибка при получении цен магазина",
			});
			return c.json(body, status as 200);
		}
	})

	// ── GET /prices/:sku — цена конкретного товара по артикулу ─────────────
	.get("/prices/:sku", async (c) => {
		try {
			const sku     = c.req.param("sku");
			const query   = validate(OnecGetPriceBySkuQuerySchema, c.req.query());
			const drizzle = c.get("drizzle");

			const rows = await getPriceBySku(drizzle, sku, query.store, query.price_type);

			if (rows.length === 0) {
				return jsonError(c, 404, "ONEC_SKU_NOT_FOUND", `Цена для SKU «${sku}» не найдена`);
			}

			return c.json({ data: rows });
		} catch (error) {
			const { status, body } = toApiErrorPayload(error, {
				code:    "ONEC_GET_PRICE_BY_SKU_FAILED",
				message: "Ошибка при получении цены по SKU",
			});
			return c.json(body, status as 200);
		}
	})

	// ── GET /prices/:sku/history — история изменений цены ──────────────────
	.get("/prices/:sku/history", async (c) => {
		try {
			const sku     = c.req.param("sku");
			const query   = validate(OnecGetPriceHistoryQuerySchema, c.req.query());
			const drizzle = c.get("drizzle");

			const rows = await getPriceHistory(drizzle, sku, query.store, query.limit);

			return c.json({ sku, data: rows });
		} catch (error) {
			const { status, body } = toApiErrorPayload(error, {
				code:    "ONEC_GET_PRICE_HISTORY_FAILED",
				message: "Ошибка при получении истории цен",
			});
			return c.json(body, status as 200);
		}
	})

	// ── GET /import-log — последние N записей лога импорта ─────────────────
	.get("/import-log", async (c) => {
		try {
			const query   = validate(OnecImportLogQuerySchema, c.req.query());
			const drizzle = c.get("drizzle");

			const rows = await getImportLogs(drizzle, query.limit);
			return c.json({ data: rows });
		} catch (error) {
			const { status, body } = toApiErrorPayload(error, {
				code:    "ONEC_GET_IMPORT_LOG_FAILED",
				message: "Ошибка при получении лога импорта",
			});
			return c.json(body, status as 200);
		}
	})

	// ── GET /stats — сводная статистика по ценам из 1С ─────────────────────
	.get("/stats", async (c) => {
		try {
			const drizzle = c.get("drizzle");
			const stats   = await getOnecStats(drizzle);
			return c.json({ status: "ok", ...stats });
		} catch (error) {
			const { status, body } = toApiErrorPayload(error, {
				code:    "ONEC_GET_STATS_FAILED",
				message: "Ошибка при получении статистики",
			});
			return c.json(body, status as 200);
		}
	});
