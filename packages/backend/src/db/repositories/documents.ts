import type { D1Database } from "@cloudflare/workers-types";
import type { IndexDocument, Transaction } from "../../evotor/types";

function normalizeIsoOffset(value: string): string {
	return value
		.replace("+00:00", "+0000")
		.replace(/([+-]\d{2}):(\d{2})$/, "$1$2")
		.replace(/Z$/, "+0000");
}

function parseTransactions(value: unknown): Transaction[] {
	if (!value) return [];
	try {
		const parsed = JSON.parse(String(value));
		if (Array.isArray(parsed)) {
			return parsed;
		}
		console.warn("transactions is not an array:", parsed);
		return [];
	} catch (e) {
		console.warn("Ошибка парсинга transactions:", e);
		return [];
	}
}

export async function getDocumentsByPeriod(
	db: D1Database,
	shopId: string,
	since: string,
	until: string,
): Promise<IndexDocument[]> {
	try {
		const normalizedSince = normalizeIsoOffset(since);
		const normalizedUntil = normalizeIsoOffset(until);

		const stmt = await db
			.prepare(
				`
			SELECT * FROM index_documents
			WHERE shop_id = ? 
			AND REPLACE(close_date, '+00:00', '+0000') BETWEEN ? AND ?
			ORDER BY REPLACE(close_date, '+00:00', '+0000') ASC
		`,
			)
			.bind(shopId, normalizedSince, normalizedUntil);

		const result = await stmt.all();

		const documents: IndexDocument[] = result.results.map((row) => ({
			closeDate: String(row.close_date),
			number: Number(row.number),
			openUserUuid: String(row.open_user_uuid),
			shop_id: String(row.shop_id),
			type: row.type as IndexDocument["type"],
			transactions: parseTransactions(row.transactions),
		}));

		return documents;
	} catch (error) {
		console.error("Ошибка при получении документов за период:", error);
		throw error;
	}
}

export async function getDocumentsByCashOutcomeByPeriod(
	db: D1Database,
	shopId: string,
	since: string,
	until: string,
): Promise<IndexDocument[]> {
	try {
		const normalizedSince = normalizeIsoOffset(since);
		const normalizedUntil = normalizeIsoOffset(until);

		const stmt = await db
			.prepare(
				`
			SELECT close_date, number, open_user_uuid, shop_id, type, transactions
			FROM index_documents
			WHERE shop_id = ? 
			AND REPLACE(close_date, '+00:00', '+0000') BETWEEN ? AND ?
			AND type = 'CASH_OUTCOME'
			ORDER BY REPLACE(close_date, '+00:00', '+0000') ASC		
		`,
			)
			.bind(shopId, normalizedSince, normalizedUntil);

		const result = await stmt.all();

		const documents: IndexDocument[] = result.results.map((row) => ({
			closeDate: String(row.close_date),
			number: Number(row.number),
			openUserUuid: String(row.open_user_uuid),
			shop_id: String(row.shop_id),
			type: row.type as IndexDocument["type"],
			transactions: parseTransactions(row.transactions),
		}));

		return documents;
	} catch (error) {
		console.error("Ошибка при получении документов за период:", error);
		throw error;
	}
}

export async function getDocumentsBySalesPeriod(
	db: D1Database,
	shopId: string,
	since: string,
	until: string,
): Promise<IndexDocument[]> {
	try {
		const normalizedSince = normalizeIsoOffset(since);
		const normalizedUntil = normalizeIsoOffset(until);

		const stmt = await db
			.prepare(
				`
			SELECT close_date, number, open_user_uuid, shop_id, type, transactions
			FROM index_documents
			WHERE shop_id = ? 
			AND REPLACE(close_date, '+00:00', '+0000') BETWEEN ? AND ?
			AND type IN ('SELL', 'PAYBACK')
			ORDER BY REPLACE(close_date, '+00:00', '+0000') ASC		
		`,
			)
			.bind(shopId, normalizedSince, normalizedUntil);

		const result = await stmt.all();

		const documents: IndexDocument[] = result.results.map((row) => ({
			closeDate: String(row.close_date),
			number: Number(row.number),
			openUserUuid: String(row.open_user_uuid),
			shop_id: String(row.shop_id),
			type: row.type as IndexDocument["type"],
			transactions: parseTransactions(row.transactions),
		}));

		return documents;
	} catch (error) {
		console.error("Ошибка при получении документов за период:", error);
		throw error;
	}
}

export async function getDocumentsBySales(
	db: D1Database,
	shopId: string,
	since: string,
	until: string,
): Promise<IndexDocument[]> {
	try {
		const normalizedSince = normalizeIsoOffset(since);
		const normalizedUntil = normalizeIsoOffset(until);

		const stmt = await db
			.prepare(
				`
			SELECT close_date, number, open_user_uuid, shop_id, type, transactions
			FROM index_documents
			WHERE shop_id = ? 
			AND REPLACE(close_date, '+00:00', '+0000') BETWEEN ? AND ?
			AND type IN ('SELL')
			ORDER BY REPLACE(close_date, '+00:00', '+0000') ASC		
		`,
			)
			.bind(shopId, normalizedSince, normalizedUntil);

		const result = await stmt.all();

		const documents: IndexDocument[] = result.results.map((row) => ({
			closeDate: String(row.close_date),
			number: Number(row.number),
			openUserUuid: String(row.open_user_uuid),
			shop_id: String(row.shop_id),
			type: row.type as IndexDocument["type"],
			transactions: parseTransactions(row.transactions),
		}));

		return documents;
	} catch (error) {
		console.error("Ошибка при получении документов за период:", error);
		throw error;
	}
}
