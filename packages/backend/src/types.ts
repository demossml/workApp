import { Context } from "hono";
import { Evotor } from "./evotor";
import { D1Database, Fetcher } from "@cloudflare/workers-types";

export type IEnv = {
	Bindings: {
		DB: D1Database;
		BOT_TOKEN: string;
		EVOTOR_API_TOKEN: string;
		AI: Fetcher;
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
		ai: Fetcher; // уже добавлено
	};
};

export type IContext = Context<IEnv>;
