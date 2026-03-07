import type { Context, Next } from "hono";
import type { z } from "zod";
import type { IEnv } from "./types";
import { logger } from "./logger";
import { ApiError, toApiErrorPayload } from "./errors";
import { recordRequest } from "./monitoring";
import { trackAppEvent } from "./analytics/track";
import { saveApiLatencyMetric } from "./db/repositories/metricsMinute";

const REPORT_PATH_MARKERS = [
	"/api/evotor/sales-result",
	"/api/evotor/sales-garden-report",
	"/api/evotor/profit-report",
	"/api/evotor/stock-report",
	"/api/evotor/order",
	"/api/evotor/financial",
	"/api/evotor/sales-report",
	"/api/stores/openings-report",
];

function isReportPath(path: string): boolean {
	return REPORT_PATH_MARKERS.some((marker) => path.includes(marker));
}

/**
 * Middleware для валидации JSON тела запроса с использованием Zod схемы
 *
 * @example
 * ```ts
 * import { validateRequest } from './middleware';
 * import { MySchema } from './validation';
 *
 * app.post('/api/endpoint', validateRequest(MySchema), async (c) => {
 *   const data = c.get('validatedData'); // типизированные данные
 *   return c.json({ success: true });
 * });
 * ```
 */
export function validateRequest<T extends z.ZodTypeAny>(schema: T) {
	return async (c: Context<IEnv>, next: Next) => {
		try {
			const body = await c.req.json();
			const result = schema.safeParse(body);

			if (!result.success) {
				const details = result.error.errors.map((e) => ({
					field: e.path.join("."),
					message: e.message,
				}));
				throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", {
					errors: details,
				});
			}

			// Данные валидны, продолжаем выполнение
			return next();
		} catch (error) {
			const { status, body } = toApiErrorPayload(
				error,
				error instanceof Error
					? {
							code: "INVALID_JSON",
							message: error.message || "Invalid JSON",
						}
					: { code: "INVALID_JSON", message: "Invalid JSON" },
			);
			return c.json(body, status as 200, {
				"x-error-code": body.code,
			});
		}
	};
}

/**
 * Глобальный обработчик ошибок для Hono приложения
 * Логирует ошибки и возвращает читаемые сообщения клиенту
 */
export function errorHandler(err: Error, c: Context<IEnv>) {
	const traceId = c.req.header("x-trace-id") || "";
	logger.error("API Error:", {
		message: err.message,
		stack: err.stack,
		path: c.req.path,
		method: c.req.method,
		traceId: traceId || null,
	});

	// Не раскрываем внутренние детали в production
	const isDev = c.env.BOT_TOKEN?.includes("test") || false;

	const { status, body } = toApiErrorPayload(err, {
		code: "INTERNAL_ERROR",
		message: isDev ? err.message : "An unexpected error occurred",
		details: isDev ? { stack: err.stack } : undefined,
	});

	return c.json(body, status as 200, {
		"x-error-code": body.code,
		...(traceId ? { "x-trace-id": traceId } : {}),
	});
}

/**
 * Middleware для логирования запросов
 */
export function requestLogger() {
	return async (c: Context<IEnv>, next: Next) => {
		const start = Date.now();
		const path = c.req.path;
		const method = c.req.method;
		const traceId = c.req.header("x-trace-id") || "";
		let caughtError: unknown;
		const reportPath = isReportPath(path);
		if (traceId) {
			c.header("x-trace-id", traceId);
		}

		if (reportPath) {
			await trackAppEvent(c, "report_run_started", {
				traceId: traceId || undefined,
				props: { endpoint: path, method },
			});
		}

		try {
			await next();
		} catch (error) {
			caughtError = error;
			throw error;
		} finally {
			const ms = Date.now() - start;
			const status = c.res?.status || (caughtError ? 500 : 200);
			const code = c.res?.headers?.get("x-error-code") || undefined;

			recordRequest({
				method,
				path,
				status,
				latencyMs: ms,
				...(code ? { code } : {}),
			});

			try {
				await saveApiLatencyMetric(c.get("drizzle"), ms, Date.now());
			} catch (error) {
				logger.warn("Failed to save api latency metric", {
					traceId: traceId || null,
					error: error instanceof Error ? error.message : String(error),
				});
			}

			if (status >= 500) {
				logger.error(`${method} ${path} - ${status} (${ms}ms)`, {
					traceId: traceId || null,
					error:
						caughtError instanceof Error
							? caughtError.message
							: caughtError
								? String(caughtError)
								: null,
				});
			} else if (status >= 400) {
				logger.warn(`${method} ${path} - ${status} (${ms}ms)`, {
					traceId: traceId || null,
					errorCode: code || null,
				});
			} else {
				logger.debug(`${method} ${path} - ${status} (${ms}ms)`, {
					traceId: traceId || null,
				});
			}

			if (reportPath) {
				await trackAppEvent(
					c,
					status >= 400 ? "report_run_failed" : "report_run_success",
					{
						traceId: traceId || undefined,
						props: {
							endpoint: path,
							method,
							status,
							error_code: code ?? null,
						},
					},
				);
			}

			if (status >= 400 && !path.startsWith("/api/analytics/event")) {
				await trackAppEvent(c, "api_request_failed", {
					traceId: traceId || undefined,
					props: {
						endpoint: path,
						method,
						status,
						error_code: code ?? null,
					},
				});
			}
		}
	};
}
