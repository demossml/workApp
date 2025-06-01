import type { Ai, D1Database } from "@cloudflare/workers-types";
import type { Context } from "hono";
import type { Evotor } from "./evotor";

export type IEnv = {
	Bindings: {
		DB: D1Database;
		BOT_TOKEN: string;
		EVOTOR_API_TOKEN: string;
		AI: Ai;
	};
	Variables: {
		userId: string;
		shopId: string;
		user: {
			id: string;
			first_name: string;
			last_name: string;
			username: string;
			photo_url: string;
		};
		evotor: Evotor;
		db: D1Database;
	};
};

export type IContext = Context<IEnv>;
