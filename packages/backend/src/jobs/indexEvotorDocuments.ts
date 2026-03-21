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
import {
	buildSalesHourlyRows,
	upsertSalesHourlyRows,
} from "../db/repositories/salesHourly";
import { normalizeDocuments } from "../analytics/normalize";
import {
	ensureNormalizedTables,
	upsertReceiptPositions,
	upsertReceipts,
	upsertReferenceSets,
	upsertStoresWithNames,
} from "../db/repositories/normalizedSales";
import { recomputeDailySales } from "../analytics/dailySales";
import { recomputeTopProducts } from "../analytics/topProducts";
import { upsertEmployeesDetails } from "../db/repositories/employeesDetails";
import { recomputeEmployeeKpiDailyForShopDates } from "../db/repositories/employeeKpiDaily";
import {
	buildAiReportKey,
	buildSalesDayKey,
	buildSalesHourKey,
	buildTopProductsKey,
	getDateKey,
} from "../utils/kvCache";

export async function runEvotorDocumentsIndexingJob(
	bindings: IEnv["Bindings"],
): Promise<void> {
	const evotor = new Evotor(bindings.EVOTOR_API_TOKEN, bindings.KV);
	const db = bindings.DB;

	await createIndexDocumentsTable(db);
	await createIndexOnType(db);
	await ensureNormalizedTables(db);
	try {
		const shops = await evotor.getShopNameUuids();
		if (shops && shops.length > 0) {
			await upsertStoresWithNames(db, shops);
		}
	} catch (error) {
		logger.warn("Stores sync skipped", { error });
	}
	try {
		const employees = await evotor.getEmployees();
		await upsertEmployeesDetails(db, employees);
	} catch (error) {
		logger.warn("Employees sync skipped", { error });
	}

	let shopUuids: string[] = [];
	try {
		shopUuids = await evotor.getShopUuids();
	} catch (error) {
		logger.warn("Evotor shop UUIDs fetch failed, trying DB fallback", {
			error,
		});
		const fallback = await db
			.prepare("SELECT store_uuid FROM stores")
			.all<{ store_uuid: string }>();
		shopUuids = (fallback.results || [])
			.map((row) => row.store_uuid)
			.filter(Boolean);
	}
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
		await upsertSalesHourlyRows(db, buildSalesHourlyRows(bootstrapDocuments));
		const normalizedBootstrap = normalizeDocuments(bootstrapDocuments);
		await upsertReceipts(db, normalizedBootstrap.receipts);
		await upsertReceiptPositions(db, normalizedBootstrap.positions);
		await upsertReferenceSets(db, normalizedBootstrap.sets);
		const bootstrapShopDates = Array.from(
			normalizedBootstrap.sets.shopDates,
		).map((value) => {
			const [shopId, date] = value.split(":");
			return { shopId, date };
		});
		await recomputeDailySales(db, bootstrapShopDates);
		await recomputeTopProducts(db, bootstrapShopDates);
		await recomputeEmployeeKpiDailyForShopDates(db, bootstrapShopDates);
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
	await upsertSalesHourlyRows(db, buildSalesHourlyRows(documents));
	const normalized = normalizeDocuments(documents);
	await upsertReceipts(db, normalized.receipts);
	await upsertReceiptPositions(db, normalized.positions);
	await upsertReferenceSets(db, normalized.sets);
	const shopDates = Array.from(normalized.sets.shopDates).map((value) => {
		const [shopId, date] = value.split(":");
		return { shopId, date };
	});
	await recomputeDailySales(db, shopDates);
	await recomputeTopProducts(db, shopDates);
	await recomputeEmployeeKpiDailyForShopDates(db, shopDates);

	if (bindings.KV) {
		const todayKey = getDateKey(new Date());
		const deleteKeys = shopUuids.flatMap((shopId) => [
			buildSalesDayKey(shopId, todayKey),
			buildSalesHourKey(shopId, todayKey),
			buildTopProductsKey(shopId, "today"),
			buildAiReportKey(shopId, todayKey),
		]);
		deleteKeys.push(
			buildSalesDayKey("all", todayKey),
			buildSalesHourKey("all", todayKey),
			buildTopProductsKey("all", "today"),
			buildAiReportKey("all", todayKey),
		);
		await Promise.all(deleteKeys.map((key) => bindings.KV!.delete(key)));
	}

	logger.info("Evotor documents indexing completed", {
		shops: shopUuids.length,
		fetchedDocuments: documents.length,
	});
}
