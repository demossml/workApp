import type {
	D1Database,
	D1PreparedStatement,
} from "@cloudflare/workers-types";
import type { IndexDocument } from "../../evotor/types";

interface ShopLastDocument {
	shop_id: string;
	closeDate: string;
}

function normalizeIsoOffset(value: string): string {
	return value
		.replace("+00:00", "+0000")
		.replace(/([+-]\d{2}):(\d{2})$/, "$1$2")
		.replace(/Z$/, "+0000");
}

export async function createIndexDocumentsTable(db: D1Database): Promise<void> {
	try {
		await db.batch([
			db.prepare(`
        CREATE TABLE IF NOT EXISTS index_documents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          number TEXT NOT NULL,
          shop_id TEXT NOT NULL,
          close_date TEXT,
          open_user_uuid TEXT,
          type TEXT,
          transactions TEXT,
          UNIQUE(number, shop_id)
        )
      `),
			db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_index_documents_shop_id 
        ON index_documents (shop_id)
      `),
			db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_index_documents_number 
        ON index_documents (number)
      `),
		]);
	} catch (err) {
		console.error("Ошибка при создании таблицы 'index_documents':", err);
		throw err;
	}
}

export async function createIndexOnType(db: D1Database): Promise<void> {
	try {
		await db
			.prepare(
				`
			CREATE INDEX IF NOT EXISTS idx_index_documents_type 
			ON index_documents (type)
		`,
			)
			.run();
	} catch (err) {
		console.error("Ошибка при создании индекса по полю 'type':", err);
		throw err;
	}
}

export async function saveNewIndexDocuments(
	db: D1Database,
	documents: IndexDocument[],
): Promise<void> {
	if (!documents?.length) {
		return;
	}

	const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO index_documents 
    (number, shop_id, close_date, open_user_uuid, type, transactions) 
    VALUES (?, ?, ?, ?, ?, ?)
  `);

	try {
		const statements = documents
			.map((doc, index) => {
				if (doc.number === undefined || doc.number === null) {
					console.warn(
						`Skipping document at index ${index}: number is missing`,
						doc,
					);
					return null;
				}
				if (!doc.shop_id) {
					console.warn(
						`Skipping document at index ${index}: shop_id is missing`,
						doc,
					);
					return null;
				}

				return insertStmt.bind(
					String(doc.number),
					doc.shop_id,
					doc.closeDate ? normalizeIsoOffset(doc.closeDate) : null,
					doc.openUserUuid ?? null,
					doc.type ?? null,
					doc.transactions ? JSON.stringify(doc.transactions) : null,
				);
			})
			.filter((stmt): stmt is D1PreparedStatement => stmt !== null);

		if (statements.length === 0) {
			return;
		}

		await db.batch(statements);
	} catch (err) {
		console.error("Error in saveNewIndexDocuments:", err);
		throw err;
	}
}

export async function getLatestCloseDates(
	db: D1Database,
	shopIds: string[],
): Promise<ShopLastDocument[]> {
	if (!shopIds?.length) {
		return [];
	}

	const validShopIds = shopIds.filter((id) => id);
	if (!validShopIds.length) {
		return [];
	}

	try {
		const result = await db
			.prepare(
				`
        SELECT shop_id, MAX(close_date) as close_date
        FROM index_documents
        WHERE shop_id IN (${validShopIds.map(() => "?").join(",")})
        GROUP BY shop_id
      `,
			)
			.bind(...validShopIds)
			.all<{ shop_id: string; close_date: string }>();

		const closeDatesMap = new Map(
			result.results.map((row) => [row.shop_id, row.close_date]),
		);

		const now = new Date();
		now.setUTCHours(3, 0, 0, 0);

		function formatDate(date: Date): string {
			return date.toISOString().replace("Z", "+0000");
		}

		return validShopIds.map((shopId) => {
			const closeDate = closeDatesMap.get(shopId);
			return {
				shop_id: shopId,
				closeDate: closeDate ?? formatDate(now),
			};
		});
	} catch (err) {
		console.error("Error in getLatestCloseDates:", err);
		throw err;
	}
}
