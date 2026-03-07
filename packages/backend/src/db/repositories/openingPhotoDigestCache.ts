import type { D1Database } from "@cloudflare/workers-types";

let schemaEnsured = false;

const ensureSchema = async (db: D1Database) => {
	if (schemaEnsured) return;

	await db
		.prepare(
			"CREATE TABLE IF NOT EXISTS openingPhotoDigestCache (" +
				"id INTEGER PRIMARY KEY AUTOINCREMENT, " +
				"date TEXT NOT NULL, " +
				"shopUuid TEXT NOT NULL, " +
				"openedByUserId TEXT NOT NULL, " +
				"openedAt TEXT, " +
				"photoCount INTEGER NOT NULL DEFAULT 0, " +
				"keysHash TEXT NOT NULL DEFAULT '', " +
				"digest TEXT NOT NULL, " +
				"photosJson TEXT NOT NULL, " +
				"modelDescribe TEXT NOT NULL, " +
				"modelSummarize TEXT NOT NULL, " +
				"updatedAt TEXT NOT NULL, " +
				"UNIQUE(date, shopUuid, openedByUserId)" +
				");",
		)
		.run();

	schemaEnsured = true;
};

export type OpeningPhotoDigestCacheRow = {
	date: string;
	shopUuid: string;
	openedByUserId: string;
	openedAt: string | null;
	photoCount: number;
	keysHash: string;
	digest: string;
	photos: Array<{ key: string; category: string; description: string }>;
	modelDescribe: string;
	modelSummarize: string;
	updatedAt: string;
};

export const getOpeningPhotoDigestCache = async (
	db: D1Database,
	date: string,
	shopUuid: string,
	openedByUserId: string,
): Promise<OpeningPhotoDigestCacheRow | null> => {
	await ensureSchema(db);

	const row = await db
		.prepare(
			`SELECT
				date, shopUuid, openedByUserId, openedAt, photoCount, keysHash,
				digest, photosJson, modelDescribe, modelSummarize, updatedAt
			FROM openingPhotoDigestCache
			WHERE date = ? AND shopUuid = ? AND openedByUserId = ?
			LIMIT 1`,
		)
		.bind(date, shopUuid, openedByUserId)
		.first<{
			date: string;
			shopUuid: string;
			openedByUserId: string;
			openedAt: string | null;
			photoCount: number;
			keysHash: string;
			digest: string;
			photosJson: string;
			modelDescribe: string;
			modelSummarize: string;
			updatedAt: string;
		}>();

	if (!row) return null;

	return {
		date: row.date,
		shopUuid: row.shopUuid,
		openedByUserId: row.openedByUserId,
		openedAt: row.openedAt,
		photoCount: row.photoCount,
		keysHash: row.keysHash,
		digest: row.digest,
		photos: JSON.parse(row.photosJson || "[]"),
		modelDescribe: row.modelDescribe,
		modelSummarize: row.modelSummarize,
		updatedAt: row.updatedAt,
	};
};

export const saveOpeningPhotoDigestCache = async (
	db: D1Database,
	payload: {
		date: string;
		shopUuid: string;
		openedByUserId: string;
		openedAt: string | null;
		photoCount: number;
		keysHash: string;
		digest: string;
		photos: Array<{ key: string; category: string; description: string }>;
		modelDescribe: string;
		modelSummarize: string;
	},
) => {
	await ensureSchema(db);
	const updatedAt = new Date().toISOString();

	await db
		.prepare(
			`INSERT INTO openingPhotoDigestCache (
				date, shopUuid, openedByUserId, openedAt, photoCount, keysHash,
				digest, photosJson, modelDescribe, modelSummarize, updatedAt
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(date, shopUuid, openedByUserId) DO UPDATE SET
				openedAt = excluded.openedAt,
				photoCount = excluded.photoCount,
				keysHash = excluded.keysHash,
				digest = excluded.digest,
				photosJson = excluded.photosJson,
				modelDescribe = excluded.modelDescribe,
				modelSummarize = excluded.modelSummarize,
				updatedAt = excluded.updatedAt`,
		)
		.bind(
			payload.date,
			payload.shopUuid,
			payload.openedByUserId,
			payload.openedAt,
			payload.photoCount,
			payload.keysHash,
			payload.digest,
			JSON.stringify(payload.photos),
			payload.modelDescribe,
			payload.modelSummarize,
			updatedAt,
		)
		.run();
};
