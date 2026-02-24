import type { D1Database } from "@cloudflare/workers-types";

export async function createSalaryTable(db: D1Database): Promise<void> {
	try {
		const createTableQuery = `
            CREATE TABLE IF NOT EXISTS salaryData (
                id INTEGER PRIMARY KEY AUTOINCREMENT, 
                date TEXT NOT NULL,                  
                shopUuid TEXT NOT NULL,              
                employeeUuid TEXT NOT NULL,          
                bonusAccessories INTEGER NOT NULL,   
                dataPlan INTEGER NOT NULL,           
                salesDataVape INTEGER NOT NULL,      
                bonusPlan INTEGER NOT NULL,          
                totalBonus INTEGER NOT NULL          
            );
        `;
		await db.prepare(createTableQuery).run();
	} catch (err) {
		console.error("Ошибка при создании таблицы:", err);
	}
}

export async function saveSalaryData(
	db: D1Database,
	dataReport: Record<string, any>,
): Promise<void> {
	try {
		const checkQuery = `
            SELECT 1 FROM salaryData
            WHERE date = ? AND shopUuid = ?;
        `;

		const existingRecord = await db
			.prepare(checkQuery)
			.bind(dataReport.date, dataReport.shopUuid)
			.first();

		if (existingRecord) {
			return;
		}

		const insertQuery = `
            INSERT INTO salaryData (
                date,
                shopUuid,
                employeeUuid,
                bonusAccessories,
                dataPlan,
                salesDataVape,
                bonusPlan,
                totalBonus
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        `;

		await db
			.prepare(insertQuery)
			.bind(
				dataReport.date,
				dataReport.shopUuid,
				dataReport.employeeUuid,
				dataReport.bonusAccessories,
				dataReport.dataPlan,
				dataReport.salesDataVape,
				dataReport.bonusPlan,
				dataReport.totalBonus,
			)
			.run();
	} catch (err) {
		console.error("Ошибка при сохранении данных в таблицу:", err);
	}
}

export async function getSalaryData(
	employeeUuid: string,
	date: string,
	shopUuid: string,
	db: D1Database,
): Promise<Record<string, any> | null> {
	try {
		const queryCheck = `
            SELECT 
                date,
                shopUuid
            FROM salaryData
            WHERE date = ? AND shopUuid = ?;
        `;

		const existingRecord = await db
			.prepare(queryCheck)
			.bind(date, shopUuid)
			.first();

		if (existingRecord) {
			return null;
		}

		const query = `
            SELECT 
                date,
                shopUuid,
                employeeUuid,
                bonusAccessories,
                dataPlan,
                salesDataVape,
                bonusPlan,
                totalBonus
            FROM salaryData
            WHERE employeeUuid = ? AND date = ?;
        `;

		const result = await db.prepare(query).bind(employeeUuid, date).first();

		if (result) {
			return result;
		}

		return null;
	} catch (err) {
		console.error("Ошибка при извлечении данных из таблицы salaryData:", err);
		throw err;
	}
}
