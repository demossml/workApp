import { z, ZodSchema } from "zod";
import { Evotor } from "../evotor";

/// Тип для схем анализа: определяет структуру анализа с входными и выходными данными
export interface AnalysisSchema<TInput, TOutput> {
	name: string; // Название анализа для идентификации
	prompt: (input: TInput) => string; // Функция генерации промпта для ИИ. Преобразует входные данные в текстовый запрос.
	outputSchema: ZodSchema<TOutput>; // Схема валидации выходных данных с использованием библиотеки Zod
}

// Объект доступных функций для вызова ИИ
const availableFunctions = {
	getShopName: {
		description: "Получить имя магазина по UUID", // Человекочитаемое описание функции
		params: z.object({ shopUuid: z.string() }), // Zod-схема валидации параметров
		call: async (evotor: Evotor, args: { shopUuid: string }) => {
			// Реализация вызова: использует экземпляр Evotor для получения данных
			return await evotor.getShopName(args.shopUuid);
		},
	},
	getEmployeeByUuid: {
		description: "Получить имя сотрудника по UUID",
		params: z.object({ employeeUuid: z.string() }),
		call: async (evotor: Evotor, args: { employeeUuid: string }) => {
			return await evotor.getEmployeeByUuid(args.employeeUuid);
		},
	},
	// Паттерн для добавления новых функций: описание + схема + реализация вызова
};

/**
 * Основная функция для выполнения анализа с помощью ИИ.
 * Поддерживает цепочки вызовов функций и валидацию ответов.
 *
 * @param evotor - Экземпляр API клиента для доступа к бизнес-логике
 * @param schema - Схема анализа: генератор промпта + валидатор вывода
 * @param input - Входные данные для анализа
 * @param ai - AI-клиент с методом run (должен поддерживать messages API)
 * @returns Результат анализа, соответствующий outputSchema
 */
export async function analyzeWithAI<TInput, TOutput>(
	evotor: Evotor,
	schema: AnalysisSchema<TInput, TOutput>,
	input: TInput,
	ai: any, // В реальном коде следует использовать конкретный тип AI-клиента
): Promise<TOutput> {
	// Генерация промпта на основе входных данных
	const prompt = schema.prompt(input);
	console.log("Generated prompt:", prompt);

	// Формирование контекста диалога
	const messages = [
		{
			role: "system",
			// Системная инструкция с объяснением формата вызовов функций
			content:
				"Ты бизнес-аналитик..." +
				Object.entries(availableFunctions)
					.map(([name, fn]) => `${name}: ${fn.description}`)
					.join("; "),
		},
		{
			role: "user",
			content: prompt, // Пользовательский запрос
		},
	];

	// Цикл обработки диалога с ИИ (поддержка цепочек вызовов)
	while (true) {
		console.log("Current messages:", JSON.stringify(messages, null, 2));

		// Отправка запроса в AI-систему
		const response = await ai.run(
			"@cf/mistralai/mistral-small-3.1-24b-instruct", // Идентификатор модели
			{ messages }, // Контекст диалога
		);

		// Обработка различных форматов ответа AI-провайдера
		let aiResponse: string;
		if (response.response) {
			aiResponse = response.response;
		} else if (response.result?.response) {
			aiResponse = response.result.response;
		} else {
			aiResponse = JSON.stringify(response); // Фолбек для нестандартных ответов
		}
		console.log("AI raw response:", aiResponse);

		// Парсинг JSON-ответа (с обработкой ошибок)
		let aiData: any;
		try {
			aiData = JSON.parse(aiResponse);
		} catch {
			aiData = aiResponse; // Используем текст как есть, если не JSON
		}

		// Проверка на запрос вызова функции
		if (
			typeof aiData === "object" &&
			aiData !== null &&
			aiData.function_call?.name
		) {
			const { name, arguments: args } = aiData.function_call;

			// Поиск запрошенной функции в доступных
			const fn = (availableFunctions as any)[name];
			if (!fn) throw new Error(`Неизвестная функция: ${name}`);

			// Валидация аргументов функции
			let parsedArgs;
			try {
				parsedArgs = fn.params.parse(args); // Zod-валидация
			} catch (e) {
				console.error(`Ошибка валидации аргументов для ${name}:`, e);
				throw e;
			}

			// Вызов целевой функции
			const result = await fn.call(evotor, parsedArgs);

			// Обновление контекста диалога:
			// 1. Добавляем запрос функции как сообщение assistant
			messages.push({
				role: "assistant",
				content: JSON.stringify({
					function_call: { name, arguments: parsedArgs },
				}),
			});
			// 2. Добавляем результат вызова как сообщение user
			messages.push({
				role: "user",
				content: `Результат ${name}: ${JSON.stringify(result)}`,
			});

			continue; // Повторяем цикл с обновленным контекстом
		}

		// Валидация финального ответа ИИ
		const validationResult = schema.outputSchema.safeParse(aiData);
		if (!validationResult.success) {
			console.error("Ошибка валидации ответа:", validationResult.error);
			throw new Error("Некорректный формат ответа ИИ");
		}

		// Возвращаем успешно валидированный результат
		return validationResult.data;
	}
}
// Пример использования:
// const result = await analyzeWithAI(evotor, myAnalysisSchema, myInputData, aiClient);
// В этом примере `myAnalysisSchema` - это объект, соответствующий интерфейсу AnalysisSchema,
