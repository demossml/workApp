import type { Context, Next } from "hono";
import type { z } from "zod";
import type { IEnv } from "./types";
import { logger } from "./logger";
import { ApiError, toApiErrorPayload } from "./errors";
import { recordRequest } from "./monitoring";

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
	logger.error("API Error:", {
		message: err.message,
		stack: err.stack,
		path: c.req.path,
		method: c.req.method,
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
		let caughtError: unknown;

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

			if (status >= 500) {
				logger.error(`${method} ${path} - ${status} (${ms}ms)`, caughtError);
			} else if (status >= 400) {
				logger.warn(`${method} ${path} - ${status} (${ms}ms)`);
			} else {
				logger.debug(`${method} ${path} - ${status} (${ms}ms)`);
			}
		}
	};
}
