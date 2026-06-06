import { Hono } from "hono";
import type { IEnv } from "../types";
import { logger } from "../logger";
import {
	FinishOpeningSchema,
	GetFileSchema,
	IsOpenStoreSchema,
	OpeningPhotosSchema,
	DeleteOpeningPhotoSchema,
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
import { handleDeadStocksUpdate } from "../services/deadStocksUpdate";
import { generateAndSendShiftSummary } from "../services/shiftSummary";

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

			const rawShops = await c.var.evotor.getShopNameUuids().catch(async (error: any) => {
				logger.warn("Evotor shops-opening-status fallback to DB stores", { error });
				const rows = await db
					.prepare("SELECT store_uuid as uuid, name FROM stores")
					.all<{ uuid: string; name: string | null }>()
					.catch(() => ({ results: [] as Array<{ uuid: string; name: string | null }> }));
				return (rows.results || []).map((row) => ({
					uuid: row.uuid,
					name: row.name || row.uuid,
				}));
			});
			const shops = Array.isArray(rawShops) ? rawShops : [];
			const openings = await getOpeningsByDate(db, date).catch((error) => {
				logger.warn("shops-opening-status: openings fallback to empty", { error });
				return [];
			});

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
				// Avoid Intl locale dependency in workerd runtime.
				const mskDate = new Date(dateObj.getTime() + 3 * 60 * 60 * 1000);
				const hh = String(mskDate.getUTCHours()).padStart(2, "0");
				const mm = String(mskDate.getUTCMinutes()).padStart(2, "0");
				return `${hh}:${mm}`;
			};
			const isLateOpening = (iso?: string | null) => {
				if (!iso) return false;
				const dateObj = new Date(iso);
				if (Number.isNaN(dateObj.getTime())) return false;
				const mskHours = dateObj.getUTCHours() + 3;
				const mskMinutes = dateObj.getUTCMinutes();
				return mskHours > 7 || (mskHours === 7 && mskMinutes > 50);
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
					isLate: isLateOpening(opening?.date ?? null),
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

	// POS sessions: real OPEN_SESSION documents from Evotor (DuckDB)
	.post("/pos-sessions", async (c) => {
		try {
			const today = new Date();
			const since = today.toISOString().slice(0, 10) + "T00:00:00+03:00";
			const until = new Date(today.getTime() + 86400000).toISOString().slice(0, 10) + "T00:00:00+03:00";

			const db = c.env.DB;
			const rows = await db
				.prepare(
					`SELECT s.store_uuid, s.store_name, s.open_date, s.open_user_uuid,
						COALESCE(e.first_name || ' ' || e.last_name, s.open_user_uuid) as employee_name
					 FROM sessions s
					 LEFT JOIN employees e ON e.uuid = s.open_user_uuid
					 WHERE s.open_date >= ? AND s.open_date < ?
					 ORDER BY s.open_date ASC`
				)
				.bind(since, until)
				.all<{
					store_uuid: string; store_name: string; open_date: string;
					open_user_uuid: string; employee_name: string;
				}>();

			// Deduplicate: first session per store
			const seen = new Set<string>();
			const sessions: Array<{
				shopUuid: string; shopName: string; openedAt: string;
				openedTime: string; openedByName: string; isLate: boolean;
			}> = [];

			for (const row of rows.results || []) {
				if (seen.has(row.store_uuid)) continue;
				seen.add(row.store_uuid);

				const openedDate = new Date(row.open_date);
				const mskHours = openedDate.getUTCHours() + 3;
				const mskMinutes = openedDate.getUTCMinutes();
				const hh = String(mskHours).padStart(2, "0");
				const mm = String(mskMinutes).padStart(2, "0");

				sessions.push({
					shopUuid: row.store_uuid,
					shopName: row.store_name,
					openedAt: row.open_date,
					openedTime: `${hh}:${mm}`,
					openedByName: row.employee_name,
					isLate: mskHours > 7 || (mskHours === 7 && mskMinutes > 50),
				});
			}

			return c.json({ sessions });
		} catch (err) {
			logger.error("Ошибка в /api/stores/pos-sessions:", err);
			return c.json({ error: "Ошибка сервера" }, 500);
		}
	})

	.get("/shops-names", async (c) => {
		try {
			const shopsName = await c.var.evotor.getShopsName();
			assert(shopsName, "not an shopOptions");
			return c.json({ shopsName });
		} catch (error) {
			logger.warn("Evotor shops-names failed, using DB fallback", { error });
			const rows = await c.env.DB
				.prepare("SELECT name FROM stores WHERE name IS NOT NULL AND name != ''")
				.all<{ name: string }>()
				.catch(() => ({ results: [] as Array<{ name: string }> }));
			const shopsName = (rows.results || [])
				.map((row) => row.name)
				.filter(Boolean);
			return c.json({ shopsName });
		}
	})

	// Store UUIDs + names for heatmap/store selectors
	.get("/list", async (c) => {
		try {
			const dict = (await c.var.evotor.getShopNameUuidsDict()) || {};
			const list = Object.entries(dict).map(([uuid, name]) => ({ uuid, name }));
			return c.json({ stores: list });
		} catch (error) {
			logger.warn("stores/list failed", { error });
			return c.json({ stores: [] });
		}
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

			const details = await getOpenStoreDetails(
				c.get("settingsDb")!,
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
				(acc: any, shop: any) => {
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
			const countPhotosFromDB = async (shopUuid: string, userId: string, dayKey: string) => {
				const { getOpeningPhotos } = await import("../db/repositories/openingPhotos");
				const rows = await getOpeningPhotos(c.get("settingsDb")!, shopUuid, userId, dayKey);
				let area = 0, stock = 0, cash = 0, mrc = 0;
				for (const r of rows) {
					if (r.category === "area") area++;
					else if (r.category === "stock") stock++;
					else if (r.category === "cash") cash++;
					else if (r.category === "mrc") mrc++;
				}
				return { area, stock, cash, mrc };
			};

			const records = await Promise.all(Array.from(grouped.values()).map(async (row) => {
				const openedAt = String(row.date || "");
				const dayKey = formatDate(new Date(openedAt));
				// MSK time check: open after 07:50 = late
				const openedDate = new Date(openedAt);
				const mskHours = openedDate.getUTCHours() + 3;
				const mskMinutes = openedDate.getUTCMinutes();
				const isLate = mskHours > 7 || (mskHours === 7 && mskMinutes > 50);
				const shopUuid = String(row.shopUuid || "");
				const employeeId = String(row.userId || "");

				const counts = await countPhotosFromDB(shopUuid, employeeId, dayKey);
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
					isLate,
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

			// Query DB for photos (Telegram file_id tokens)
			const { getOpeningPhotos } = await import("../db/repositories/openingPhotos");
			const records = await getOpeningPhotos(c.get("settingsDb")!, body.shopUuid, body.userId, dayKey);

			const photos = records.map((rec) => ({
				id: rec.id,
				key: rec.file_id,
				url: rec.file_id ? `/api/stores/opening-photo-file?file_id=${encodeURIComponent(rec.file_id)}` : null,
				category: rec.category,
				fileKey: rec.file_key,
				status: rec.status || "pending",
			}));

			return c.json({ photos });
		} catch (error) {
			logger.error("Ошибка в /api/stores/opening-photos:", error);
			return c.json(
				{ error: error instanceof Error ? error.message : "Invalid request data" },
				400
			);
		}
	})

	// Delete photo by id — removes DB record + pending file if exists
	.delete("/opening-photos", async (c) => {
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

			const body = validate(DeleteOpeningPhotoSchema, await c.req.json());
			const { deleteOpeningPhoto } = await import("../db/repositories/openingPhotos");
			const result = await deleteOpeningPhoto(c.get("settingsDb")!, body.id);

			// Clean up pending file if exists
			if (result.deleted) {
				const { existsSync, unlinkSync } = await import("fs");
				const { join } = await import("path");
				const pendingDir = "/tmp/tg_uploads/pending";
				// Also try glob-like match via checking dir
				if (existsSync(pendingDir)) {
					const { readdirSync } = await import("fs");
					try {
						for (const f of readdirSync(pendingDir)) {
							if (f.startsWith(`${body.id}_`)) {
								try { unlinkSync(join(pendingDir, f)); } catch {}
							}
						}
					} catch {}
				}
			}

			logger.info("Photo deleted", { id: body.id, fileKey: body.fileKey, userId });
			return c.json({ success: true });
		} catch (error) {
			logger.error("Ошибка в DELETE /api/stores/opening-photos:", error);
			return c.json(
				{ error: error instanceof Error ? error.message : "Invalid request data" },
				400
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

			const fileId = c.req.query("file_id");
			if (!fileId) {
				return c.json({ error: "Missing file_id" }, 400);
			}

			const botToken = c.env.BOT_TOKEN;
			if (!botToken) {
				return c.json({ error: "BOT_TOKEN not configured" }, 500);
			}

			const { getPhotoUrl } = await import("../services/telegramStorage");
			const photoUrl = await getPhotoUrl(fileId, botToken);

			// Redirect to Telegram's file URL
			return c.redirect(photoUrl);
		} catch (error) {
			logger.error("Ошибка в /api/stores/opening-photo-file:", error);
			return c.json(
				{ error: error instanceof Error ? error.message : "Failed to load file" },
				400
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
		return handleDeadStocksUpdate(c);
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

			// Не блокируем основной ответ закрытия смены из-за AI/Telegram ошибок.
			try {
				await generateAndSendShiftSummary({
					bindings: c.env,
					evotor: c.var.evotor,
					ai: c.var.ai,
					shopUuid,
				});
			} catch (summaryError) {
				logger.warn("Shift summary hook failed after finish-opening", {
					shopUuid,
					error:
						summaryError instanceof Error
							? summaryError.message
							: String(summaryError),
				});
			}

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
