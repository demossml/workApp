import { Hono } from "hono";
import type { IEnv } from "../types";
import { logger } from "../logger";
import { GetFileSchema, validate } from "../validation";
import { getData } from "../db/repositories/openShops";
import { ensureOpeningPhotosSchema } from "../db/repositories/openingPhotos";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { jsonError, toApiErrorPayload } from "../errors";

const PENDING_DIR = "/tmp/tg_uploads/pending";

export const uploadsRoutes = new Hono<IEnv>()

	// Upload single photo → save to disk, queue for Telegram upload
	.post("/upload-photos", async (c) => {
		try {
			const formData = await c.req.formData();
			const file = formData.get("file") as File | null;
			const category = formData.get("category")?.toString();
			const userId = formData.get("userId")?.toString();
			const shopUuid = formData.get("shopUuid")?.toString();
			const fileKey = formData.get("fileKey")?.toString();

			if (!userId) return jsonError(c, 400, "VALIDATION_ERROR", "Missing userId");
			if (!file) return jsonError(c, 400, "VALIDATION_ERROR", "Missing file");
			if (!category) return jsonError(c, 400, "VALIDATION_ERROR", "Missing category");
			if (!fileKey) return jsonError(c, 400, "VALIDATION_ERROR", "Missing fileKey");

			const allowed = ["area", "stock", "cash", "mrc"];
			if (!allowed.includes(category)) {
				return jsonError(c, 400, "VALIDATION_ERROR", "Invalid category");
			}

			// Ensure table + pending dir exist
			const db = c.get("settingsDb")!;
			await ensureOpeningPhotosSchema(db);

			if (!existsSync(PENDING_DIR)) {
				mkdirSync(PENDING_DIR, { recursive: true });
			}

			// Save pending record in DB
			const now = new Date();
			const dd = String(now.getDate()).padStart(2, "0");
			const mm = String(now.getMonth() + 1).padStart(2, "0");
			const yyyy = now.getFullYear();
			const dateStr = `${dd}-${mm}-${yyyy}`;

			const result = await db
				.prepare(
					`INSERT INTO opening_photos (id, shop_uuid, user_id, date, category, file_key, status)
					 VALUES (nextval('opening_photos_seq'), ?, ?, ?, ?, ?, 'pending') RETURNING id`
				)
				.bind(shopUuid || "unknown", userId, dateStr, category, fileKey)
				.first<{ id: number }>();

			const recId = result?.id;
			if (!recId) throw new Error("Failed to insert photo record");

			// Write photo to pending dir
			const photoPath = join(PENDING_DIR, `${recId}_${randomUUID()}.jpg`);
			const buffer = Buffer.from(await file.arrayBuffer());
			writeFileSync(photoPath, buffer);

			logger.debug("Photo queued for Telegram upload", { recId, fileKey, path: photoPath });

			return c.json({
				success: true,
				fileKey,
				category,
				queued: true,
				id: recId,
			});
		} catch (err) {
			logger.error("Upload photos error", err);
			const { status, body } = toApiErrorPayload(err, {
				code: "UPLOAD_PHOTOS_FAILED",
				message: "Server error",
			});
			return c.json(body, status as 200);
		}
	})

	// Batch upload — same as single but for multiple files
	.post("/upload-photos-batch", async (c) => {
		try {
			const formData = await c.req.formData();
			const userId = formData.get("userId")?.toString();
			if (!userId) return jsonError(c, 400, "VALIDATION_ERROR", "Missing userId");

			const files = formData.getAll("files") as unknown as File[];
			const categories = formData.getAll("categories").map(String);
			const fileKeys = formData.getAll("fileKeys").map(String);

			if (files.length === 0) return jsonError(c, 400, "VALIDATION_ERROR", "No files");
			if (files.length !== categories.length || files.length !== fileKeys.length) {
				return jsonError(c, 400, "VALIDATION_ERROR", "Invalid batch structure");
			}

			const allowed = ["area", "stock", "cash", "mrc"];
			const db = c.get("settingsDb")!;
			await ensureOpeningPhotosSchema(db);

			if (!existsSync(PENDING_DIR)) {
				mkdirSync(PENDING_DIR, { recursive: true });
			}

			const now = new Date();
			const dd = String(now.getDate()).padStart(2, "0");
			const mm = String(now.getMonth() + 1).padStart(2, "0");
			const yyyy = now.getFullYear();
			const dateStr = `${dd}-${mm}-${yyyy}`;

			const saved: { id: number; category: string; fileKey: string }[] = [];

			for (let i = 0; i < files.length; i++) {
				const file = files[i];
				const category = categories[i];
				const fileKey = fileKeys[i];

				if (!allowed.includes(category)) continue;
				if (!(file instanceof File)) continue;

				const result = await db
					.prepare(
						`INSERT INTO opening_photos (id, shop_uuid, user_id, date, category, file_key, status)
						 VALUES (nextval('opening_photos_seq'), ?, ?, ?, ?, ?, 'pending') RETURNING id`
					)
					.bind(userId, userId, dateStr, category, fileKey)
					.first<{ id: number }>();

				if (result?.id) {
					const photoPath = join(PENDING_DIR, `${result.id}_${randomUUID()}.jpg`);
					const buffer = Buffer.from(await file.arrayBuffer());
					writeFileSync(photoPath, buffer);
					saved.push({ id: result.id, category, fileKey });
				}
			}

			return c.json({ success: true, saved });
		} catch (error) {
			logger.error("Batch upload error", error);
			const { status, body } = toApiErrorPayload(error, {
				code: "UPLOAD_BATCH_FAILED",
				message: "Upload failed",
			});
			return c.json(body, status as 200);
		}
	})

	// Legacy: retrieve photos from old openShops table
	.post("/getFile", async (c) => {
		try {
			const data = await c.req.json();
			const { date, shop } = validate(GetFileSchema, data);
			const dataOpening = await getData(date, shop, c.get("db"));
			const dataUrlPhoto: string[] = [];
			const keysPhoto = [
				"photoCashRegisterPhoto", "photoСabinetsPhoto",
				"photoShowcasePhoto1", "photoShowcasePhoto2", "photoShowcasePhoto3",
				"photoMRCInputput", "photoTerritory1", "photoTerritory2",
			];
			const dataReport: Record<string, string> = {};

			if (dataOpening !== null) {
				for (const [key, value] of Object.entries(dataOpening)) {
					if (keysPhoto.includes(key) && value !== null) {
						dataUrlPhoto.push(String(value));
					}
				}
			}

			return c.json({ dataReport, dataUrlPhoto });
		} catch (error) {
			return c.json(
				{ error: error instanceof Error ? error.message : "Invalid request data" },
				400
			);
		}
	});
