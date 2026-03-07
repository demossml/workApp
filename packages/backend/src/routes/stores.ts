import { Hono } from "hono";
import type { IEnv, SaveDeadStocksRequest } from "../types";
import { logger } from "../logger";
import {
	FinishOpeningSchema,
	GetFileSchema,
	IsOpenStoreSchema,
	OpeningPhotosSchema,
	OpeningsReportSchema,
	OpenStoreSchema,
	ShopsOpeningStatusSchema,
	validate,
} from "../validation";
import {
	assert,
	formatDate,
	formatDateWithTime,
	getTelegramFile,
} from "../utils";
import { saveDeadStocks } from "../db/repositories/saveDeadStocks";
import { sendDeadStocksToTelegram } from "../../utils/sendDeadStocksToTelegram";
import { getData } from "../db/repositories/openShops";
import {
	getLatestShopOpeningForDate,
	getLatestUserOpeningForDate,
	getOpeningsByDate,
	getOpenStoreRowsByPeriod,
	getOpenStoreDetails,
	saveOpenStorsTable,
	updateOpenStore,
} from "../db/repositories/openStores";
import {
	getOpeningsReportCache,
	saveOpeningsReportCache,
} from "../db/repositories/openingsReportCache";
import { trackAppEvent } from "../analytics/track";

export const storesRoutes = new Hono<IEnv>()

	.get("/shops", async (c) => {
		const shopsNameAndUuid = await c.var.evotor.getShopNameUuids();
		assert(shopsNameAndUuid, "not an shopsNameAndUuid");
		return c.json({ shopsNameAndUuid });
	})

	.post("/shops-opening-status", async (c) => {
		try {
			const { date } = validate(ShopsOpeningStatusSchema, await c.req.json());
			const db = c.env.DB;
			const currentUserId = c.var.userId || "";

			const [shops, openings] = await Promise.all([
				c.var.evotor.getShopNameUuids(),
				getOpeningsByDate(db, date),
			]);
			assert(shops, "not an shopsNameAndUuid");

			const openingByShop = new Map<
				string,
				{ userId: string; openedByName: string | null; date: string }
			>();
			for (const row of openings) {
				if (!openingByShop.has(row.shopUuid)) {
					openingByShop.set(row.shopUuid, {
						userId: row.userId,
						openedByName: row.openedByName,
						date: row.date,
					});
				}
			}

			const currentUserOpening = openings.find(
				(row) => row.userId === currentUserId,
			);
			const currentUserShopName =
				shops.find((shop) => shop.uuid === currentUserOpening?.shopUuid)?.name ?? null;
			const formatOpenedTime = (iso?: string | null) => {
				if (!iso) return null;
				const dateObj = new Date(iso);
				if (Number.isNaN(dateObj.getTime())) return null;
				return dateObj.toLocaleTimeString("ru-RU", {
					hour: "2-digit",
					minute: "2-digit",
				});
			};

			const shopsNameAndUuid = shops.map((shop) => {
				const opening = openingByShop.get(shop.uuid);
				const openedTime = formatOpenedTime(opening?.date ?? null);
				const openedByCurrentUser = !!opening && opening.userId === currentUserId;
				const isOpenedByAnotherUser = !!opening && !openedByCurrentUser;
				const isBlockedByOwnDailyLimit =
					!!currentUserOpening && currentUserOpening.shopUuid !== shop.uuid;

				let blockedReason: string | null = null;
				if (isBlockedByOwnDailyLimit) {
					blockedReason = `Вы уже открыли магазин: ${currentUserShopName || currentUserOpening?.shopUuid}${openedTime ? ` в ${openedTime}` : ""}`;
				} else if (isOpenedByAnotherUser) {
					blockedReason = `Уже открыл: ${opening?.openedByName || opening?.userId}${openedTime ? ` в ${openedTime}` : ""}`;
				}

				return {
					uuid: shop.uuid,
					name: shop.name,
					isOpenedToday: !!opening,
					openedByUserId: opening?.userId ?? null,
					openedByName: opening?.openedByName ?? null,
					openedAt: opening?.date ?? null,
					openedTime,
					canSelect: !isOpenedByAnotherUser && !isBlockedByOwnDailyLimit,
					blockedReason,
				};
			});

			return c.json({ shopsNameAndUuid });
		} catch (err) {
			logger.error("Ошибка в /api/stores/shops-opening-status:", err);
			return c.json({ error: "Ошибка сервера" }, 500);
		}
	})

	.get("/shops-names", async (c) => {
		const shopsName = await c.var.evotor.getShopsName();

		assert(shopsName, "not an shopOptions");

		return c.json({ shopsName });
	})

	.post("/get-file", async (c) => {
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

			const countingMoneyKeyBase = "РСХОЖДЕНИЙ ПО КАССЕ (ПЕРЕСЧЕТ ДЕНЕГ)";

			if (dataOpening !== null) {
				for (const [key, value] of Object.entries(dataOpening)) {
					if (keysPhoto.includes(key)) {
						if (value !== null) {
							const urlFile = await getTelegramFile(value, c.env.BOT_TOKEN);
							dataUrlPhoto.push(urlFile);
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

					const shopName = await c.var.evotor.getShopName(shop);
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
	})

	.post("/is-open-store", async (c) => {
		try {
			const data = await c.req.json();
			const { userId, date, shopUuid } = validate(IsOpenStoreSchema, data);

			const db = c.env.DB;

			const details = await getOpenStoreDetails(
				db,
				c.env.R2,
				userId,
				shopUuid,
				date,
			);

			if (!details) {
				logger.warn("Не удалось получить детали открытия магазина", {
					userId,
					date,
					shopUuid,
				});
				return c.json({ exists: false });
			}

			return c.json(details);
		} catch (err) {
			logger.error("Ошибка в /api/is-open-store:", err);
			return c.json({ exists: false, error: "Ошибка сервера" }, 500);
		}
	})

	.post("/openings-report", async (c) => {
		try {
			const OPENINGS_REPORT_TTL_MS = 10 * 60 * 1000;
			const userId = c.var.userId || "";
			const roleFromEvotor = userId
				? await c.var.evotor.getEmployeeRole(userId)
				: null;
			const employeeRole =
				userId === "5700958253" || userId === "475039971"
					? "SUPERADMIN"
					: roleFromEvotor;

			if (employeeRole !== "SUPERADMIN") {
				return c.json({ error: "Доступ только для SUPERADMIN" }, 403);
			}

			const body = validate(OpeningsReportSchema, await c.req.json().catch(() => ({})));
			const startDate =
				body.startDate || new Date().toISOString().slice(0, 10);
			const endDate = body.endDate || startDate;

			const cached = await getOpeningsReportCache(c.env.DB, startDate, endDate);
			if (cached) {
				const age = Date.now() - new Date(cached.updatedAt).getTime();
				if (Number.isFinite(age) && age < OPENINGS_REPORT_TTL_MS) {
					return c.json(cached.payload);
				}
			}

			const sinceIso = formatDateWithTime(new Date(startDate), false);
			const untilIso = formatDateWithTime(new Date(endDate), true);

			const [rows, shops] = await Promise.all([
				getOpenStoreRowsByPeriod(c.env.DB, sinceIso, untilIso),
				c.var.evotor.getShopNameUuids(),
			]);
			const shopsList = shops ?? [];

			const shopNameMap = shopsList.reduce(
				(acc, shop) => {
					acc[shop.uuid] = shop.name;
					return acc;
				},
				{} as Record<string, string>,
			);

			const pickCashStatus = (
				ok: number | null,
				sign: string | null,
				cash: number | null,
			): "not_checked" | "ok" | "surplus" | "shortage" => {
				if (ok === 1) return "ok";
				if (sign === "+") return "surplus";
				if (sign === "-") return "shortage";
				if (cash != null && cash > 0) return "surplus";
				return "not_checked";
			};

			const grouped = new Map<string, (typeof rows)[number]>();
			for (const row of rows) {
				const openedAt = String(row.date || "");
				const day = openedAt.includes("T")
					? openedAt.slice(0, 10)
					: startDate;
				const key = `${String(row.shopUuid || "")}|${day}`;
				const existing = grouped.get(key);
				if (!existing) {
					grouped.set(key, row);
					continue;
				}
				const existingTs = new Date(String(existing.date || "")).getTime();
				const currentTs = new Date(openedAt).getTime();
				if (currentTs > existingTs) {
					grouped.set(key, row);
				}
			}

			const uniqueEmployeeIds = Array.from(
				new Set(
					Array.from(grouped.values())
						.map((item) => String(item.userId || ""))
						.filter(Boolean),
				),
			);

			const employeeNamesMap: Record<string, string> = {};
			if (uniqueEmployeeIds.length > 0) {
				const names = await Promise.all(
					uniqueEmployeeIds.map(async (employeeId) => {
						const name = await c.var.evotor.getEmployeeLastName(employeeId);
						return [employeeId, name] as const;
					}),
				);
				for (const [employeeId, name] of names) {
					employeeNamesMap[employeeId] = name || employeeId;
				}
			}

			const requiredPhotoCount = 7;
			const countByCategory = async (prefix: string) => {
				let cursor: string | undefined;
				const bucketKeys = new Set<string>();
				do {
					const listed = await c.env.R2.list({ prefix, cursor });
					for (const obj of listed.objects) {
						bucketKeys.add(obj.key);
					}
					cursor = listed.truncated ? listed.cursor : undefined;
				} while (cursor);
				let area = 0;
				let stock = 0;
				let cash = 0;
				let mrc = 0;
				for (const key of bucketKeys) {
					if (key.includes("/area/")) area += 1;
					if (key.includes("/stock/")) stock += 1;
					if (key.includes("/cash/")) cash += 1;
					if (key.includes("/mrc/")) mrc += 1;
				}
				return { area, stock, cash, mrc };
			};

			const records = await Promise.all(Array.from(grouped.values()).map(async (row) => {
				const openedAt = String(row.date || "");
				const dayKey = formatDate(new Date(openedAt));
				const shopUuid = String(row.shopUuid || "");
				const employeeId = String(row.userId || "");

				let counts = await countByCategory(
					`evotor/opening/${dayKey}/${shopUuid}/${employeeId}/`,
				);
				if (counts.area + counts.stock + counts.cash + counts.mrc === 0) {
					counts = await countByCategory(
						`opening/${dayKey}/${shopUuid}/${employeeId}/`,
					);
				}
				const photoCount =
					Math.min(counts.area, 2) +
					Math.min(counts.stock, 3) +
					Math.min(counts.cash, 1) +
					Math.min(counts.mrc, 1);

				const cashStatus = pickCashStatus(row.ok, row.sign, row.cash);
				const hasCashCheck = cashStatus !== "not_checked";
				const completionPercent = Math.round(
					((Math.min(photoCount, requiredPhotoCount) + (hasCashCheck ? 1 : 0)) /
						(requiredPhotoCount + 1)) *
						100,
				);

				return {
					shopUuid,
					shopName: shopNameMap[shopUuid] || shopUuid,
					employeeId,
					employeeName:
						(String(row.openedByName || "").trim() ||
							employeeNamesMap[employeeId] ||
							employeeId),
					openedAt,
					photoCount,
					requiredPhotoCount,
					hasCashCheck,
					cashStatus,
					cashMessage: row.cash != null ? String(row.cash) : null,
					completionPercent,
				};
			}));

			const openedShops = new Set(records.map((item) => item.shopUuid)).size;
			const avgCompletion =
				records.length > 0
					? Math.round(
							records.reduce((sum, item) => sum + item.completionPercent, 0) /
								records.length,
						)
					: 0;

			const summary = {
				startDate,
				endDate,
				totalShops: shopsList.length,
				openedShops,
				notOpenedShops: Math.max(shopsList.length - openedShops, 0),
				avgCompletion,
				withCashDiscrepancy: records.filter(
					(item) =>
						item.cashStatus === "surplus" || item.cashStatus === "shortage",
					).length,
				missingPhotos: records.filter(
					(item) => item.photoCount < item.requiredPhotoCount,
				).length,
			};

			const payload = {
				summary,
				records: records.sort(
					(a, b) =>
						new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime(),
				),
			};

			await saveOpeningsReportCache(c.env.DB, startDate, endDate, payload);
			return c.json(payload);
		} catch (error) {
			logger.error("Ошибка в /api/stores/openings-report:", error);
			return c.json(
				{
					error:
						error instanceof Error ? error.message : "Invalid request data",
				},
				400,
			);
		}
	})

	.post("/opening-photos", async (c) => {
		try {
			const userId = c.var.userId || "";
			const initData = c.req.header("initData") || c.req.query("initData") || "";
			const telegramId =
				c.req.header("telegram-id") || c.req.query("telegram-id") || "";
			const roleFromEvotor = userId
				? await c.var.evotor.getEmployeeRole(userId)
				: null;
			const employeeRole =
				userId === "5700958253" || userId === "475039971"
					? "SUPERADMIN"
					: roleFromEvotor;
			if (employeeRole !== "SUPERADMIN") {
				return c.json({ error: "Доступ только для SUPERADMIN" }, 403);
			}

			const body = validate(OpeningPhotosSchema, await c.req.json());
			const openedDate = new Date(body.openedAt);
			if (Number.isNaN(openedDate.getTime())) {
				return c.json({ error: "Некорректный openedAt" }, 400);
			}
			const dayKey = formatDate(openedDate);
			const prefixes = [
				`evotor/opening/${dayKey}/${body.shopUuid}/${body.userId}/`,
				`opening/${dayKey}/${body.shopUuid}/${body.userId}/`,
			];
			const listPhotosByPrefix = async (prefix: string) => {
				let cursor: string | undefined;
				const photos: Array<{ key: string; url: string; category: string }> = [];

				do {
					const listed = await c.env.R2.list({ prefix, cursor });
					for (const obj of listed.objects) {
						const rel = obj.key.slice(prefix.length);
						if (!rel) continue;
						const category = rel.split("/")[0] || "other";
						photos.push({
							key: obj.key,
							url: `/api/stores/opening-photo-file?key=${encodeURIComponent(obj.key)}&initData=${encodeURIComponent(initData)}&telegram-id=${encodeURIComponent(telegramId)}`,
							category,
						});
					}
					cursor = listed.truncated ? listed.cursor : undefined;
				} while (cursor);

				return photos;
			};

			const allPhotos = (
				await Promise.all(prefixes.map((prefix) => listPhotosByPrefix(prefix)))
			).flat();
			const dedup = new Map<string, { key: string; url: string; category: string }>();
			for (const photo of allPhotos) {
				if (!dedup.has(photo.key)) {
					dedup.set(photo.key, photo);
				}
			}

			return c.json({
				photos: Array.from(dedup.values()).sort((a, b) =>
					a.key.localeCompare(b.key),
				),
			});
		} catch (error) {
			logger.error("Ошибка в /api/stores/opening-photos:", error);
			return c.json(
				{
					error:
						error instanceof Error ? error.message : "Invalid request data",
				},
				400,
			);
		}
	})

	.get("/opening-photo-file", async (c) => {
		try {
			const userId = c.var.userId || "";
			const roleFromEvotor = userId
				? await c.var.evotor.getEmployeeRole(userId)
				: null;
			const employeeRole =
				userId === "5700958253" || userId === "475039971"
					? "SUPERADMIN"
					: roleFromEvotor;
			if (employeeRole !== "SUPERADMIN") {
				return c.json({ error: "Доступ только для SUPERADMIN" }, 403);
			}

			const key = c.req.query("key");
			if (!key) {
				return c.json({ error: "Missing key" }, 400);
			}
			// Ограничиваем выдачу только файлами открытия
			if (!key.startsWith("evotor/opening/") && !key.startsWith("opening/")) {
				return c.json({ error: "Invalid key prefix" }, 400);
			}

			const object = await c.env.R2.get(key);
			if (!object) {
				return c.json({ error: "File not found" }, 404);
			}

			const headers = new Headers();
			if (object.httpMetadata?.contentType) {
				headers.set("content-type", object.httpMetadata.contentType);
			}
			headers.set("etag", object.httpEtag);
			headers.set("cache-control", "private, max-age=60");

			const body = await object.arrayBuffer();
			return new Response(body, { status: 200, headers });
		} catch (error) {
			logger.error("Ошибка в /api/stores/opening-photo-file:", error);
			return c.json(
				{
					error:
						error instanceof Error ? error.message : "Failed to load file",
				},
				400,
			);
		}
	})

	.post("/open-store", async (c) => {
		try {
			const data = await c.req.json();
			const { userId, timestamp, shopUuid, date, userName } = validate(
				OpenStoreSchema,
				data,
			);
			await trackAppEvent(c, "open_store_started", {
				userId,
				shopUuid,
				props: { date },
			});

				const db = c.env.DB;
				const userAlreadyOpenedToday = await getLatestUserOpeningForDate(
					db,
					userId,
					date,
				);
				if (userAlreadyOpenedToday) {
					if (userAlreadyOpenedToday.shopUuid === shopUuid) {
						await trackAppEvent(c, "open_store_success", {
							userId,
							shopUuid,
							props: { alreadyExists: true },
						});
						return c.json({ ok: true, alreadyExists: true });
					}
					await trackAppEvent(c, "open_store_failed", {
						userId,
						shopUuid,
						props: { reason: "user_already_opened_other_shop" },
					});
					return c.json(
						{
							ok: false,
							error: "Вы уже открыли другой магазин сегодня",
							alreadyOpenedShopUuid: userAlreadyOpenedToday.shopUuid,
						},
						409,
					);
				}

				const alreadyOpened = await getLatestShopOpeningForDate(db, shopUuid, date);
				if (alreadyOpened) {
					const openedByName =
						alreadyOpened.openedByName?.trim() || alreadyOpened.userId;
				if (alreadyOpened.userId !== userId) {
					await trackAppEvent(c, "open_store_failed", {
						userId,
						shopUuid,
						props: { reason: "shop_already_opened_by_other_user" },
					});
					return c.json(
						{
							ok: false,
							error: `Магазин уже открыт пользователем: ${openedByName}`,
							openedByName,
						},
						409,
					);
				}
				await trackAppEvent(c, "open_store_success", {
					userId,
					shopUuid,
					props: { alreadyExists: true },
				});
				return c.json({ ok: true, alreadyExists: true });
			}

			const openedByName =
				userName?.trim() ||
				`${c.var.user?.first_name ?? ""} ${c.var.user?.last_name ?? ""}`.trim() ||
				userId;

			await saveOpenStorsTable(db, {
				date: timestamp,
				userId,
				shopUuid,
				openedByName,
				cash: null,
				sign: null,
				ok: null,
			});
			await trackAppEvent(c, "open_store_success", {
				userId,
				shopUuid,
				props: { alreadyExists: false },
			});

			return c.json({ ok: true });
		} catch (error) {
			const payload = await c.req.json().catch(() => null);
			await trackAppEvent(c, "open_store_failed", {
				shopUuid:
					payload && typeof payload.shopUuid === "string"
						? payload.shopUuid
						: undefined,
				userId:
					payload && typeof payload.userId === "string"
						? payload.userId
						: undefined,
				props: {
					reason: error instanceof Error ? error.message : "invalid_request_data",
				},
			});
			return c.json(
				{
					error:
						error instanceof Error ? error.message : "Invalid request data",
				},
				400,
			);
		}
	})

	.post("/dead-stocks/update", async (c) => {
		try {
			const db = c.get("drizzle");

			const { shopUuid, items } = await c.req.json<
				SaveDeadStocksRequest & { userId: number }
			>();
			await trackAppEvent(c, "deadstock_save_started", {
				shopUuid,
				props: { itemsCount: Array.isArray(items) ? items.length : 0 },
			});

			if (!shopUuid || !items || !Array.isArray(items)) {
				await trackAppEvent(c, "deadstock_save_failed", {
					shopUuid: shopUuid || undefined,
					props: { reason: "invalid_request_data" },
				});
				return c.json({ success: false, error: "Invalid request data" }, 400);
			}

			const TELEGRAM_GROUP_ID = "5700958253";

			try {
				await sendDeadStocksToTelegram(
					{
						chatId: TELEGRAM_GROUP_ID,
						shopUuid,
						items,
					},
					c.env.BOT_TOKEN,
					c.var.evotor,
				);
			} catch (telegramError) {
				logger.error("Failed to send to Telegram", telegramError);
			}

			await saveDeadStocks(db, shopUuid, items);
			await trackAppEvent(c, "deadstock_save_success", {
				shopUuid,
				props: { itemsCount: items.length },
			});

			return c.json({ success: true });
		} catch (error) {
			await trackAppEvent(c, "deadstock_save_failed", {
				props: {
					reason:
						error instanceof Error ? error.message : "dead_stocks_update_failed",
				},
			});
			logger.error("Dead stocks update failed", error);
			return c.json(
				{
					success: false,
					error:
						error instanceof Error
							? error.message
							: "Failed to update dead stocks",
				},
				500,
			);
		}
	})

	.post("/finish-opening", async (c) => {
		try {
			const db = c.env.DB;

			const data = await c.req.json();
			const { ok, discrepancy, userId, shopUuid } = validate(
				FinishOpeningSchema,
				data,
			);

			logger.debug("Processing discrepancy data", { discrepancy, ok });

			let cash = null;
			let sign = null;
			let okValue: number | null = null;

			if (!ok && discrepancy) {
				cash = Number(discrepancy.amount);
				sign = discrepancy.type;
			}
			if (ok !== null) {
				okValue = ok ? 1 : 0;
			}

			await updateOpenStore(db, userId, shopUuid, { cash, sign, ok: okValue });

			return c.json({ success: true });
		} catch (error) {
			logger.error("Finish opening failed", error);
			return c.json(
				{
					success: false,
					error:
						error instanceof Error ? error.message : "Failed to finish opening",
				},
				500,
			);
		}
	});
