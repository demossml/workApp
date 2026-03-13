import { Hono } from "hono";
import type { IEnv } from "../types";
import { validate } from "../validation";
import { z } from "zod";
import {
	buildAiReportKey,
	buildSalesDayKey,
	buildSalesHourKey,
	buildTopProductsKey,
} from "../utils/kvCache";

const ReceiptCreatedSchema = z.object({
	storeId: z.string().min(1),
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const eventsRoutes = new Hono<IEnv>()
	.post("/receipt-created", async (c) => {
		const payload = await c.req.json().catch(() => ({}));
		const { storeId, date } = validate(ReceiptCreatedSchema, payload);
		const kv = c.env.KV;
		if (!kv) {
			return c.json({ ok: false, error: "KV_NOT_CONFIGURED" }, 500);
		}

		const keys = [
			buildSalesDayKey(storeId, date),
			buildSalesHourKey(storeId, date),
			buildTopProductsKey(storeId, "today"),
			buildAiReportKey(storeId, date),
			buildSalesDayKey("all", date),
			buildSalesHourKey("all", date),
			buildTopProductsKey("all", "today"),
			buildAiReportKey("all", date),
		];

		await Promise.all(keys.map((key) => kv.delete(key)));

		return c.json({ ok: true, deleted: keys.length });
	});
