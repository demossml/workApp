import type { D1Database } from "@cloudflare/workers-types";
import type { IEnv } from "../types";
import type { IndexDocument } from "../evotor/types";
import { getDocumentsByPeriod } from "../db/repositories/documents";
import {
	createIndexDocumentsTable,
	createIndexOnType,
	saveNewIndexDocuments,
} from "../db/repositories/indexDocuments";

const INDEX_STALE_THRESHOLD_MS = 5 * 60 * 1000;
const COMPLETED_WINDOW_GRACE_MS = 60 * 60 * 1000;
let indexSchemaEnsured = false;

type EvotorForIndexDocuments = Pick<IEnv["Variables"]["evotor"], "getDocumentsIndex">;

function isIndexFreshEnough(documents: IndexDocument[], untilIso: string): boolean {
	if (documents.length === 0) return false;
	const latestCloseDate = documents[documents.length - 1]?.closeDate;
	if (!latestCloseDate) return false;

	const latestTs = new Date(latestCloseDate).getTime();
	const untilTs = new Date(untilIso).getTime();
	if (!Number.isFinite(latestTs) || !Number.isFinite(untilTs)) return false;

	const nowTs = Date.now();

	// For completed windows we trust indexed data and avoid expensive refetches.
	if (untilTs < nowTs - COMPLETED_WINDOW_GRACE_MS) {
		return true;
	}

	// For current windows compare against current time, not end-of-day "until".
	const freshnessTargetTs = Math.min(untilTs, nowTs);
	return freshnessTargetTs - latestTs <= INDEX_STALE_THRESHOLD_MS;
}

async function ensureIndexSchema(db: D1Database): Promise<void> {
	if (indexSchemaEnsured) return;
	await createIndexDocumentsTable(db);
	await createIndexOnType(db);
	indexSchemaEnsured = true;
}

export async function getDocumentsFromIndexFirst(
	db: D1Database,
	evo: EvotorForIndexDocuments,
	shopUuid: string,
	since: string,
	until: string,
	options?: { types?: IndexDocument["type"][] },
): Promise<IndexDocument[]> {
	await ensureIndexSchema(db);

	let indexedDocs = await getDocumentsByPeriod(db, shopUuid, since, until);

	if (!isIndexFreshEnough(indexedDocs, until)) {
		const fetchSince =
			indexedDocs.length > 0
				? indexedDocs[indexedDocs.length - 1].closeDate
				: since;
		const directDocs = await evo.getDocumentsIndex(shopUuid, fetchSince, until);
		if (directDocs.length > 0) {
			await saveNewIndexDocuments(db, directDocs);
			indexedDocs = await getDocumentsByPeriod(db, shopUuid, since, until);
		}
	}

	if (options?.types?.length) {
		const allowed = new Set(options.types);
		return indexedDocs.filter((doc) => allowed.has(doc.type));
	}

	return indexedDocs;
}
