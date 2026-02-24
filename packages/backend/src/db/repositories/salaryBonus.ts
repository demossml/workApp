import type { D1Database } from "@cloudflare/workers-types";

interface SalaryBonus {
	salary: number;
	bonus: number;
	data: string;
}

export async function createSalaryBonusTable(db: D1Database): Promise<void> {
	try {
		const createTableQuery = `
            CREATE TABLE IF NOT EXISTS salary_bonus (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			data TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			salary INTEGER NOT NULL,
			bonus INTEGER NOT NULL
		);
        `;
		await db.prepare(createTableQuery).run();
	} catch (err) {
		console.error("Ошибка при создании таблицы:", err);
	}
}

export async function saveSalaryAndBonus(
	data: string,
	salary: number,
	bonus: number,
	db: D1Database,
): Promise<void> {
	try {
		const checkQuery = "SELECT * FROM salary_bonus WHERE data = ?;";
		const checkStatement = db.prepare(checkQuery);
		const result = await checkStatement.bind(data).first();

		if (result) {
			const updateQuery = `
                UPDATE salary_bonus
                SET salary = ?, bonus = ?
                WHERE data = ?;
            `;
			const updateStatement = db.prepare(updateQuery);
			await updateStatement.bind(salary, bonus, data).run();
		} else {
			const insertQuery = `
                INSERT INTO salary_bonus (data, salary, bonus)
                VALUES (?, ?, ?);
            `;
			const insertStatement = db.prepare(insertQuery);
			await insertStatement.bind(data, salary, bonus).run();
		}
	} catch (err) {
		console.error("Ошибка при добавлении или обновлении записи:", err);
	}
}

export async function getSalaryAndBonus(
	date: string,
	db: D1Database,
): Promise<SalaryBonus | null> {
	try {
		const query = `
            SELECT salary, bonus, data 
            FROM salary_bonus
            WHERE data <= ?
            ORDER BY data DESC
            LIMIT 1
        `;

		const statement = db.prepare(query);
		const result = await statement.bind(date).all();

		if (result?.results && result.results.length > 0) {
			return result.results[0] as unknown as SalaryBonus;
		}
		return null;
	} catch (err) {
		console.error("Ошибка при получении зарплаты и премии:", err);
		return null;
	}
}
