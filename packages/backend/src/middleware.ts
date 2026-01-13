import type { Context, Next } from "hono";
import type { z } from "zod";
import type { IEnv } from "./types";
import { logger } from "./logger";

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
				const errors = result.error.errors.map((e) => ({
					field: e.path.join("."),
					message: e.message,
				}));

				return c.json(
					{
						error: "Validation failed",
						details: errors,
					},
					400,
				);
			}

			// Данные валидны, продолжаем выполнение
			return next();
		} catch (error) {
			return c.json(
				{
					error: "Invalid JSON",
					message: error instanceof Error ? error.message : "Unknown error",
				},
				400,
			);
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

	return c.json(
		{
			error: "Internal Server Error",
			message: isDev ? err.message : "An unexpected error occurred",
			...(isDev && { stack: err.stack }),
		},
		500,
	);
}

/**
 * Middleware для логирования запросов
 */
export function requestLogger() {
	return async (c: Context<IEnv>, next: Next) => {
		const start = Date.now();
		const path = c.req.path;
		const method = c.req.method;

		await next();

		const ms = Date.now() - start;
		const status = c.res.status;

		// Простое логирование (можно расширить)
		logger.debug(`${method} ${path} - ${status} (${ms}ms)`);
	};
}
