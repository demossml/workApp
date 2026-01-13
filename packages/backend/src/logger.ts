/**
 * Централизованная система логирования
 * Автоматически отключает debug логи в production
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LoggerConfig {
	env?: string;
	minLevel?: LogLevel;
}

class Logger {
	private config: LoggerConfig;
	private readonly levels: Record<LogLevel, number> = {
		debug: 0,
		info: 1,
		warn: 2,
		error: 3,
	};

	constructor(config: LoggerConfig = {}) {
		this.config = {
			env: config.env || "production",
			minLevel: config.minLevel,
		};

		// Устанавливаем минимальный уровень, если не задан
		if (!this.config.minLevel) {
			this.config.minLevel =
				this.config.env === "production" ? "info" : "debug";
		}
	}

	private shouldLog(level: LogLevel): boolean {
		const currentLevel = this.levels[level];
		const minLevel = this.levels[this.config.minLevel || "info"];
		return currentLevel >= minLevel;
	}

	private formatMessage(
		level: LogLevel,
		message: string,
		data?: unknown,
	): string {
		const timestamp = new Date().toISOString();
		const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

		if (data) {
			return `${prefix} ${message} ${JSON.stringify(data)}`;
		}
		return `${prefix} ${message}`;
	}

	/**
	 * Debug логи - только для разработки
	 * Автоматически отключаются в production
	 */
	debug(message: string, data?: unknown): void {
		if (this.shouldLog("debug")) {
			console.log(this.formatMessage("debug", message, data));
		}
	}

	/**
	 * Информационные логи
	 */
	info(message: string, data?: unknown): void {
		if (this.shouldLog("info")) {
			console.log(this.formatMessage("info", message, data));
		}
	}

	/**
	 * Предупреждения
	 */
	warn(message: string, data?: unknown): void {
		if (this.shouldLog("warn")) {
			console.warn(this.formatMessage("warn", message, data));
		}
	}

	/**
	 * Ошибки - всегда логируются
	 */
	error(message: string, error?: unknown): void {
		if (this.shouldLog("error")) {
			const errorData =
				error instanceof Error
					? { message: error.message, stack: error.stack }
					: error;
			console.error(this.formatMessage("error", message, errorData));
		}
	}

	/**
	 * Обновление конфигурации
	 */
	setConfig(config: Partial<LoggerConfig>): void {
		this.config = { ...this.config, ...config };
	}
}

// Создаем синглтон логгер
export const logger = new Logger();

// Для удобства экспортируем методы
export const { debug, info, warn, error } = logger;

// Экспортируем сам логгер для конфигурации
export default logger;
