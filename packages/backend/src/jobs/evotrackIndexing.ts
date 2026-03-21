import { Evotor } from "../evotor";
import type { IEnv } from "../types";
import { logger } from "../logger";
import { formatDate, formatDateWithTime } from "../utils";
import {
	createProductsTableIfNotExists,
	getProductsByGroup,
	updateOrInsertData,
} from "../db/repositories/products";
import { getAllUuid } from "../db/repositories/accessories";
import { getSalaryAndBonus } from "../db/repositories/salaryBonus";
import { createSalaryTable, saveSalaryData } from "../db/repositories/salaryData";
import { createPlanTable, getPlan, updatePlan } from "../db/repositories/plan";
import { runEvotorDocumentsIndexingJob } from "./indexEvotorDocuments";

const VAPE_GROUP_IDS: string[] = [
	"78ddfd78-dc52-11e8-b970-ccb0da458b5a",
	"bc9e7e4c-fdac-11ea-aaf2-2cf05d04be1d",
	"0627db0b-4e39-11ec-ab27-2cf05d04be1d",
	"2b8eb6b4-92ea-11ee-ab93-2cf05d04be1d",
	"8a8fcb5f-9582-11ee-ab93-2cf05d04be1d",
	"97d6fa81-84b1-11ea-b9bb-70c94e4ebe6a",
	"ad8afa41-737d-11ea-b9b9-70c94e4ebe6a",
	"568905bd-9460-11ee-9ef4-be8fe126e7b9",
	"568905be-9460-11ee-9ef4-be8fe126e7b9",
];

type SessionRow = { shopUuid: string; employeeUuid: string };

export async function updateProducts(
	bindings: IEnv["Bindings"],
): Promise<void> {
	const evotor = new Evotor(bindings.EVOTOR_API_TOKEN, bindings.KV);
	const db = bindings.DB;

	await createProductsTableIfNotExists(db);

	const shopUuids = await evotor.getShopUuids();
	for (const shopUuid of shopUuids) {
		const products = await evotor.getProductsShopUuidsT(shopUuid);
		await updateOrInsertData(products, db);
	}

	logger.info("EvoTrack indexing: products updated", {
		shops: shopUuids.length,
	});
}

export async function updateProductsShope(
	bindings: IEnv["Bindings"],
): Promise<void> {
	// В исходном EvoTrack обе задачи пишут в одну таблицу shopProduct.
	await updateProducts(bindings);
	logger.info("EvoTrack indexing: products by shop updated");
}

export async function getDocuments(bindings: IEnv["Bindings"]): Promise<void> {
	await runEvotorDocumentsIndexingJob(bindings);
}

async function getOpenSessionsForDate(
	db: IEnv["Bindings"]["DB"],
	since: string,
	until: string,
): Promise<SessionRow[]> {
	const rows = await db
		.prepare(
			`
      SELECT DISTINCT
        shop_id AS shopUuid,
        open_user_uuid AS employeeUuid
      FROM index_documents
      WHERE type = 'OPEN_SESSION'
        AND open_user_uuid IS NOT NULL
        AND shop_id IS NOT NULL
        AND close_date >= ?
        AND close_date <= ?
    `,
		)
		.bind(since, until)
		.all<SessionRow>();

	return (rows.results || []).filter(
		(row) => Boolean(row.shopUuid) && Boolean(row.employeeUuid),
	);
}

export async function getDataForCurrentDate(
	bindings: IEnv["Bindings"],
): Promise<void> {
	const evotor = new Evotor(bindings.EVOTOR_API_TOKEN, bindings.KV);
	const db = bindings.DB;

	const date = new Date();
	date.setDate(date.getDate() - 1);

	const datePlan = formatDate(date);
	const since = formatDateWithTime(date, false);
	const until = formatDateWithTime(date, true);

	await createPlanTable(db);
	await createSalaryTable(db);

	const [groupIdsAks, salaryAndBonus, sessions] = await Promise.all([
		getAllUuid(db),
		getSalaryAndBonus(datePlan, db),
		getOpenSessionsForDate(db, since, until),
	]);

	if (sessions.length === 0) {
		logger.info("EvoTrack indexing: salary skipped, no open sessions", {
			date: datePlan,
		});
		return;
	}

	let plan = await getPlan(datePlan, db);
	if (!plan || Object.keys(plan).length === 0) {
		plan = await evotor.getPlan(date, (shopId) =>
			getProductsByGroup(db, shopId, VAPE_GROUP_IDS),
		);
		await updatePlan(plan, datePlan, db);
	}

	const bonusValue = Number(salaryAndBonus?.bonus || 0);
	const uniqueSessions = new Map<string, SessionRow>();
	for (const session of sessions) {
		uniqueSessions.set(`${session.shopUuid}:${session.employeeUuid}`, session);
	}

	for (const session of uniqueSessions.values()) {
		const { shopUuid, employeeUuid } = session;
		const [productsAks, productsVape] = await Promise.all([
			getProductsByGroup(db, shopUuid, groupIdsAks),
			getProductsByGroup(db, shopUuid, VAPE_GROUP_IDS),
		]);

		const [salesDataAks, salesDataVape] = await Promise.all([
			productsAks.length > 0
				? evotor.getSalesSum(shopUuid, since, until, productsAks, db)
				: Promise.resolve(0),
			productsVape.length > 0
				? evotor.getSalesSum(shopUuid, since, until, productsVape, db)
				: Promise.resolve(0),
		]);

		const currentPlan = Number(plan?.[shopUuid] || 0);
		const bonusAccessories = Math.floor(salesDataAks * 0.05);
		const bonusPlan = salesDataVape >= currentPlan ? bonusValue : 0;

		await saveSalaryData(db, {
			date: datePlan,
			shopUuid,
			employeeUuid,
			bonusAccessories,
			dataPlan: currentPlan,
			salesDataVape,
			bonusPlan,
			totalBonus: bonusAccessories + bonusPlan,
		});
	}

	logger.info("EvoTrack indexing: salary updated", {
		date: datePlan,
		sessions: uniqueSessions.size,
	});
}

type IndexingTask = {
	label: string;
	run: (bindings: IEnv["Bindings"]) => Promise<void>;
};

export const evotrackIndexingTasks: IndexingTask[] = [
	{ label: "обновления ЗП", run: getDataForCurrentDate },
	{ label: "обновления продуктов", run: updateProducts },
	{ label: "обновления продуктов магазинов", run: updateProductsShope },
	{ label: "получение документов", run: getDocuments },
];

