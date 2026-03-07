import { Evotor } from "../evotor";
import type { IEnv } from "../types";
import { logger } from "../logger";
import { formatDateWithTime } from "../utils";
import {
	createIndexDocumentsTable,
	createIndexOnType,
	getLatestCloseDates,
	saveNewIndexDocuments,
} from "../db/repositories/indexDocuments";

export async function runEvotorDocumentsIndexingJob(
	bindings: IEnv["Bindings"],
): Promise<void> {
	const evotor = new Evotor(bindings.EVOTOR_API_TOKEN);
	const db = bindings.DB;

	await createIndexDocumentsTable(db);
	await createIndexOnType(db);

	const shopUuids = await evotor.getShopUuids();
	if (shopUuids.length === 0) {
		logger.warn("Evotor documents indexing skipped: no shops found");
		return;
	}

	const countRow = await db
		.prepare("SELECT COUNT(*) as count FROM index_documents")
		.first<{ count: number }>();
	const docsCount = Number(countRow?.count || 0);
	if (docsCount === 0) {
		const now = new Date();
		const sinceDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
		const bootstrapQueries = shopUuids.map((shopId) => ({
			shopId,
			since: formatDateWithTime(sinceDate, false),
			until: formatDateWithTime(now, true),
		}));
		const bootstrapDocuments =
			await evotor.getDocumentsIndexForShops(bootstrapQueries);
		await saveNewIndexDocuments(db, bootstrapDocuments);
		logger.info("Evotor documents indexing bootstrap completed", {
			shops: shopUuids.length,
			fetchedDocuments: bootstrapDocuments.length,
		});
	}

	const latestByShop = await getLatestCloseDates(db, shopUuids);
	const until = formatDateWithTime(new Date(), true);
	const queries = latestByShop.map((row) => ({
		shopId: row.shop_id,
		since: row.closeDate,
		until,
	}));

	const documents = await evotor.getDocumentsIndexForShops(queries);
	await saveNewIndexDocuments(db, documents);

	logger.info("Evotor documents indexing completed", {
		shops: shopUuids.length,
		fetchedDocuments: documents.length,
	});
}
