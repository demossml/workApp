import type { AppDB } from "../../db-duckdb.js";

export async function createSalaryTable(db: AppDB): Promise<void> {
	// Legacy table — no longer used. salary_data is created by salary_calc.py / services/salary.ts
}

export async function saveSalaryData(
	db: AppDB,
	dataReport: Record<string, any>,
): Promise<void> {
	// Legacy function — no longer used. salary_calc.py writes directly to salary_data
}

export interface CachedSalary {
	date: string;
	bonusAccessories: number;
	dataPlan: number;
	salesDataVape: number;
	bonusPlan: number;
	totalBonus: number;
	okladDaily: number;
}

export async function getSalaryData(
	employeeUuid: string,
	date: string,
	_shopUuid: string,
	db: AppDB,
): Promise<CachedSalary | null> {
	try {
		// Query the actual salary_data table (DuckDB), not the old D1 salaryData
		const query = `
			SELECT date_val, bonus_accessories, plan_value, vape_sales, bonus_plan, total_bonus, oklad_daily
			FROM salary_data
			WHERE employee_uuid = ? AND date_val = ?
			LIMIT 1
		`;
		const result = await db.prepare(query).bind(employeeUuid, date).first<{
			date_val: string; bonus_accessories: number; plan_value: number;
			vape_sales: number; bonus_plan: number; total_bonus: number; oklad_daily: number;
		}>();

		if (result) {
			// DuckDB may return date_val as Date object or string — normalize to YYYY-MM-DD
			const rawDate = (result.date_val instanceof Date)
				? result.date_val.toISOString().slice(0, 10)
				: String(result.date_val ?? '').slice(0, 10);
			return {
				date: rawDate,
				bonusAccessories: Number(result.bonus_accessories) || 0,
				dataPlan: Number(result.plan_value) || 0,
				salesDataVape: Number(result.vape_sales) || 0,
				bonusPlan: Number(result.bonus_plan) || 0,
				totalBonus: Number(result.total_bonus) || 0,
				okladDaily: Number(result.oklad_daily) || 0,
			};
		}

		return null;
	} catch (err) {
		console.error("Ошибка при извлечении данных из salary_data:", err);
		return null;
	}
}
