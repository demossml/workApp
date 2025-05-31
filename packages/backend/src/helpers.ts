import { Next } from "hono";
import { Evotor } from "./evotor";
import { IContext } from "./types";
import { assert, isValidSign } from "./utils";

export const initialize = (c: IContext, next: Next) => {
	c.set("evotor", new Evotor(c.env.EVOTOR_API_TOKEN));
	c.set("db", c.env.DB);
	c.set("ai", c.env.AI);
	// Контекст успешно инициализирован: evotor, db, ai.
	return next();
};

export const authenticate = async (c: IContext, next: Next) => {
	// console.log("Полученные заголовки:", c.req.header("initData"));
	const initData = c.req.header("initData") || "guest";
	// console.log(initData);

	assert(initData, "initData is missing");

	if (initData === "guest") {
		// console.log("guest");

		c.set("user", {
			id: "490899906",
			first_name: "guest",
			last_name: "guest",
			username: "guest",
			photo_url: "",
		});
		c.set("userId", "490899906");
	} else {
		const payload = Object.fromEntries(new URLSearchParams(initData));
		const isValid = await isValidSign(c.env.BOT_TOKEN, payload);
		assert(isValid, "invalid signature");

		const user = JSON.parse(payload.user);
		// console.log(user);
		c.set("user", user);
		c.set("userId", user.id.toString());
	}

	return next();
};
