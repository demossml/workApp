import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";
import type { Employee } from "../../evotor/types";

export async function ensureEmployeesDetailsTable(
	db: D1Database,
): Promise<void> {
	await db
		.prepare(
			"CREATE TABLE IF NOT EXISTS employees_details (uuid TEXT PRIMARY KEY, id TEXT, name TEXT, last_name TEXT, patronymic_name TEXT, phone TEXT, role TEXT, role_id TEXT, user_id TEXT, stores TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')))",
		)
		.run();
	await db
		.prepare(
			"CREATE INDEX IF NOT EXISTS idx_employees_details_user_id ON employees_details (user_id)",
		)
		.run();
}

export async function upsertEmployeesDetails(
	db: D1Database,
	employees: Employee[],
): Promise<void> {
	if (!employees.length) return;
	await ensureEmployeesDetailsTable(db);

	const stmt = db.prepare(
		"INSERT INTO employees_details (uuid, id, name, last_name, patronymic_name, phone, role, role_id, user_id, stores, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')) ON CONFLICT(uuid) DO UPDATE SET id = excluded.id, name = excluded.name, last_name = excluded.last_name, patronymic_name = excluded.patronymic_name, phone = excluded.phone, role = excluded.role, role_id = excluded.role_id, user_id = excluded.user_id, stores = excluded.stores, updated_at = datetime('now')",
	);

	const statements: D1PreparedStatement[] = employees
		.filter((employee) => employee?.uuid)
		.map((employee) =>
			stmt.bind(
				employee.uuid,
				employee.id ?? null,
				employee.name ?? null,
				employee.last_name ?? employee.lastName ?? null,
				employee.patronymic_name ?? null,
				employee.phone != null ? String(employee.phone) : null,
				employee.role ?? null,
				employee.role_id ?? null,
				employee.user_id ?? null,
				Array.isArray(employee.stores) ? JSON.stringify(employee.stores) : null,
			),
		);

	if (statements.length > 0) {
		await db.batch(statements);
	}
}

type EmployeeDetailsRow = {
	uuid: string;
	id: string | null;
	name: string | null;
	last_name: string | null;
	patronymic_name: string | null;
	phone: string | null;
	role: string | null;
	role_id: string | null;
	user_id: string | null;
	stores: string | null;
};

function parseStores(raw: string | null): string[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed)
			? parsed.filter((item) => typeof item === "string")
			: [];
	} catch {
		return [];
	}
}

export async function getEmployeeDetailsByUserId(
	db: D1Database,
	userId: string,
): Promise<EmployeeDetailsRow | null> {
	await ensureEmployeesDetailsTable(db);
	const row = await db
		.prepare(
			"SELECT uuid, id, name, last_name, patronymic_name, phone, role, role_id, user_id, stores FROM employees_details WHERE user_id = ? LIMIT 1",
		)
		.bind(userId)
		.first<EmployeeDetailsRow>();
	return row ?? null;
}

export async function listEmployeeDetails(
	db: D1Database,
): Promise<EmployeeDetailsRow[]> {
	await ensureEmployeesDetailsTable(db);
	const result = await db
		.prepare(
			"SELECT uuid, id, name, last_name, patronymic_name, phone, role, role_id, user_id, stores FROM employees_details",
		)
		.all<EmployeeDetailsRow>();
	return result.results ?? [];
}

export async function listEmployeeDetailsByShop(
	db: D1Database,
	shopId: string,
): Promise<EmployeeDetailsRow[]> {
	await ensureEmployeesDetailsTable(db);
	const result = await db
		.prepare(
			"SELECT uuid, id, name, last_name, patronymic_name, phone, role, role_id, user_id, stores FROM employees_details WHERE stores LIKE ?",
		)
		.bind(`%\"${shopId}\"%`)
		.all<EmployeeDetailsRow>();
	return result.results ?? [];
}

export function toEmployeeSummary(row: EmployeeDetailsRow) {
	return {
		uuid: row.uuid,
		id: row.id ?? null,
		name: row.name ?? "",
		last_name: row.last_name ?? null,
		patronymic_name: row.patronymic_name ?? null,
		phone: row.phone ?? null,
		role: row.role ?? null,
		role_id: row.role_id ?? null,
		user_id: row.user_id ?? null,
		stores: parseStores(row.stores),
	};
}
