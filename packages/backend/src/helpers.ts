import type { Next } from "hono";
import { Evotor } from "./evotor";
import type { IContext } from "./types";
import { isValidSign } from "./utils";
import { drizzle } from "drizzle-orm/d1";
import { jsonError } from "./errors";
import { trackAppEvent } from "./analytics/track";

export const initializeDrizzle = (c: IContext) => {
	const db = drizzle(c.env.DB); // c.env.DB — это D1Database
	c.set("drizzle", db); // сохраняем в контекст
	return db;
};

export const initialize = (c: IContext, next: Next) => {
	c.set("evotor", new Evotor(c.env.EVOTOR_API_TOKEN));
	c.set("db", c.env.DB);
	c.set("drizzle", drizzle(c.env.DB));
	c.set("ai", c.env.AI);
	c.set("r2", c.env.R2);
	c.set("r2Url", c.env.R2_PUBLIC_URL);
	c.set("BOT_TOKEN", c.env.BOT_TOKEN);

	return next();
};

export const authenticate = async (c: IContext, next: Next) => {
	try {
		const initData =
			c.req.header("initData") || c.req.query("initData") || "guest";

		// режим "гость"
		if (initData === "guest") {
			const manualId =
				c.req.header("telegram-id") || c.req.query("telegram-id");

			if (manualId) {
				// пользователь ввёл Telegram ID вручную
				c.set("user", {
					id: manualId,
					first_name: "",
					last_name: "",
					username: "",
					photo_url: "",
				});
				c.set("userId", manualId);
			} else {
				// гость без ID
				c.set("user", {
					id: "",
					first_name: "",
					last_name: "",
					username: "",
					photo_url: "",
				});
				c.set("userId", "");
			}
			await trackAppEvent(c, "auth_guest_login", {
				userId: manualId || null,
				props: { hasManualId: Boolean(manualId) },
			});
		} else {
			// проверка WebApp initData
			const payload = Object.fromEntries(new URLSearchParams(initData));
			const isValid = await isValidSign(c.env.BOT_TOKEN, payload);

			if (!isValid) {
				return jsonError(c, 401, "AUTH_INVALID_SIGNATURE", "Invalid signature");
			}

			const user = JSON.parse(payload.user);
			c.set("user", user);
			c.set("userId", user.id.toString());
			await trackAppEvent(c, "auth_webapp_verified", {
				userId: user.id.toString(),
			});
		}

		return next();
	} catch (error) {
		return jsonError(
			c,
			401,
			"AUTH_FAILED",
			error instanceof Error ? error.message : "Unknown error",
		);
	}
};
