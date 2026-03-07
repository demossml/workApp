import { Hono } from "hono";
import type { IEnv } from "../types";
import { logger } from "../logger";
import {
	assert,
	formatDate,
	getTelegramFile,
	saveFileToR2,
} from "../utils";
import { GetFileSchema, validate } from "../validation";
import { getData } from "../db/repositories/openShops";
import { jsonError, toApiErrorPayload } from "../errors";

export const uploadsRoutes = new Hono<IEnv>()

	.post("/upload-photos-batch", async (c) => {
		try {
			const formData = await c.req.formData();

			const userId = formData.get("userId")?.toString();
			if (!userId) {
				return jsonError(c, 400, "VALIDATION_ERROR", "Missing userId");
			}

			const files = formData.getAll("files") as unknown as File[];
			const categories = formData.getAll("categories").map(String);
			const fileKeys = formData.getAll("fileKeys").map(String);

			if (files.length === 0) {
				return jsonError(c, 400, "VALIDATION_ERROR", "No files uploaded");
			}

			if (
				files.length !== categories.length ||
				files.length !== fileKeys.length
			) {
				logger.warn("Invalid batch structure in FormData");
				return c.json(
					{
						code: "VALIDATION_ERROR",
						message: "Invalid batch structure",
					},
					400,
				);
			}

			const allowed = ["area", "stock", "cash", "mrc"];

			const now = new Date();
			const dd = String(now.getDate()).padStart(2, "0");
			const mm = String(now.getMonth() + 1).padStart(2, "0");
			const yyyy = now.getFullYear();

			const dateFolder = `evotor/opening/${dd}-${mm}-${yyyy}/${userId}`;

			const saved: { key: string; category: string; fileKey: string }[] = [];

			for (let i = 0; i < files.length; i++) {
				const file = files[i];
				const category = categories[i];
				const fileKey = fileKeys[i];

				if (!allowed.includes(category)) {
					logger.warn("Invalid category", { category });
					continue;
				}

				if (!(file instanceof File)) {
					logger.warn("Invalid file object");
					continue;
				}

				const key = `${dateFolder}/${category}/${file.name}`;

				logger.debug("Saving file", { index: i + 1, total: files.length, key });

				await saveFileToR2(c.env.R2, file, key);

				logger.debug("File saved", { key });

				saved.push({ key, category, fileKey });
			}

			return c.json({
				success: true,
				saved,
			});
		} catch (error) {
			logger.error("Batch upload error", error);
			const { status, body } = toApiErrorPayload(error, {
				code: "UPLOAD_BATCH_FAILED",
				message: "Upload failed",
			});
			return c.json(body, status as 200);
		}
	})

	.post("/upload-photos", async (c) => {
		try {
			const formData = await c.req.formData();

			const file = formData.get("file") as File | null;
			const category = formData.get("category")?.toString();
			const userId = formData.get("userId")?.toString();
			const shopUuid = formData.get("shopUuid")?.toString();
			const fileKey = formData.get("fileKey")?.toString();

			if (!userId) {
				return jsonError(c, 400, "VALIDATION_ERROR", "Missing userId");
			}

			if (!file) {
				return jsonError(c, 400, "VALIDATION_ERROR", "Missing file");
			}

			if (!category) {
				return jsonError(c, 400, "VALIDATION_ERROR", "Missing category");
			}
			if (!fileKey) {
				return jsonError(c, 400, "VALIDATION_ERROR", "Missing fileKey");
			}

			const allowed = ["area", "stock", "cash", "mrc"] as const;
			type AllowedCategory = (typeof allowed)[number];
			if (!allowed.includes(category as AllowedCategory)) {
				return jsonError(c, 400, "VALIDATION_ERROR", "Invalid category");
			}

			const now = new Date();
			const dd = String(now.getDate()).padStart(2, "0");
			const mm = String(now.getMonth() + 1).padStart(2, "0");
			const yyyy = now.getFullYear();

			const resolvedShopUuid = shopUuid || "unknown-shop";
			const folder = `evotor/opening/${dd}-${mm}-${yyyy}/${resolvedShopUuid}/${userId}/${category}`;
			const uniqueName = `${Date.now()}_${file.name}`;
			const key = `${folder}/${uniqueName}`;

			logger.debug("Saving file", { fileName: file.name, key });

			await saveFileToR2(c.env.R2, file, key);

			logger.debug("File saved successfully", { key });

			return c.json({
				success: true,
				fileKey,
				category,
				key,
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

	.post("/upload", async (c) => {
		try {
			const formData = await c.req.formData();
			logger.debug("Upload request", {
				entriesCount: Array.from(formData.entries()).length,
			});

			const file = formData.get("photos") as File | null;
			if (!file || !(file instanceof File)) {
				return jsonError(c, 400, "VALIDATION_ERROR", "Нет файла для загрузки");
			}

			const savedKey = `uploads/${crypto.randomUUID()}_${file.name}`;
			const arrayBuffer = await file.arrayBuffer();
			logger.debug("Processing file", {
				name: file.name,
				type: file.type,
				size: file.size,
			});

			await c.env.R2.put(savedKey, arrayBuffer, {
				httpMetadata: { contentType: file.type || "application/octet-stream" },
			});

			const publicUrl = `https://pub-a1a3c60dd9754ffba505cb0039a032fa.r2.dev/${savedKey}`;
			logger.debug("File saved to R2", { publicUrl });

			return c.json({
				url: publicUrl,
				name: file.name,
			});
		} catch (error) {
			logger.error("Error saving file", { error });
			const { status, body } = toApiErrorPayload(error, {
				code: "UPLOAD_FAILED",
				message: "Ошибка сохранения файла",
			});
			return c.json(body, status as 200);
		}
	})

	.post("/getFile", async (c) => {
		try {
			const data = await c.req.json();
			const { date, shop } = validate(GetFileSchema, data);

			const sinceDateOpening: string = formatDate(new Date(date));

			const dataOpening = await getData(sinceDateOpening, shop, c.get("db"));

			const dataUrlPhoto: string[] = [];

			const keysPhoto = [
				"photoCashRegisterPhoto",
				"photoСabinetsPhoto",
				"photoShowcasePhoto1",
				"photoShowcasePhoto2",
				"photoShowcasePhoto3",
				"photoMRCInputput",
				"photoTerritory1",
				"photoTerritory2",
			];

			const dataReport: Record<string, string> = {};

			// Формируем данные о пересчёте денег
			const countingMoneyKeyBase = "РСХОЖДЕНИЙ ПО КАССЕ (ПЕРЕСЧЕТ ДЕНЕГ)";

			if (dataOpening !== null) {
				for (const [key, value] of Object.entries(dataOpening)) {
					if (keysPhoto.includes(key)) {
						if (value !== null) {
							const urlFile = await getTelegramFile(value, c.env.BOT_TOKEN);
							dataUrlPhoto.push(urlFile); // Добавляем значение в результат
						}
					}

					if (
						dataOpening?.countingMoney === null ||
						String(dataOpening?.countingMoney) === "converge"
					) {
						dataReport[`✅${countingMoneyKeyBase}`] = "НЕТ";
					}
					if (
						dataOpening?.countingMoney === null ||
						String(dataOpening?.countingMoney) === "more"
					) {
						const diffSign = "+";
						dataReport[`🔴${countingMoneyKeyBase}`] =
							`${diffSign}${dataOpening.CountingMoneyMessage}`;
					}
					if (
						dataOpening?.countingMoney === null ||
						String(dataOpening?.countingMoney) === "less"
					) {
						const diffSign = "-";
						dataReport[`🔴${countingMoneyKeyBase}`] =
							`${diffSign}${dataOpening.CountingMoneyMessage}`;
					}

					// Дополнительная информация
					const shopName = await c.var.evotor.getShopName(shop); // Получаем имя магазина
					const employeeName = await c.var.evotor.getEmployeeLastName(
						dataOpening.userId,
					);

					dataReport["МАГАЗИН:"] = shopName;
					dataReport["СОТРУДНИК:"] = employeeName || "Нет данных";
					const date = new Date(dataOpening.dateTime);
					date.setHours(date.getHours() + 3);
					dataReport["ВРЕМЯ ОТКРЫТИЯ TT"] = date.toISOString().slice(11, 16);
				}
			}

			assert(dataReport, "not an employee");
			assert(dataUrlPhoto, "not an employee");

			return c.json({ dataReport, dataUrlPhoto });
		} catch (error) {
			return c.json(
				{
					error:
						error instanceof Error ? error.message : "Invalid request data",
				},
				400,
			);
		}
	});
