import { Hono } from "hono";
import { z } from "zod";
import { jsonError, toApiErrorPayload } from "../errors";
import type { IEnv } from "../types";
import { validate } from "../validation";
import {
	buildDataModeMeta,
	DataModeSchema,
	getDataMode,
	setDataMode,
} from "../dataMode";

const SetDataModeSchema = z.object({
	mode: DataModeSchema,
});

export const adminRoutes = new Hono<IEnv>()
	.get("/data-mode", async (c) => {
		try {
			const mode = await getDataMode(c.env);
			return c.json({
				mode,
				meta: buildDataModeMeta(mode),
			});
		} catch (error) {
			console.error("[ADMIN] GET /data-mode error:", error);
			const { status, body } = toApiErrorPayload(error, {
				code: "ADMIN_DATA_MODE_GET_FAILED",
				message: "Failed to read data mode",
			});
			return jsonError(c, status, body.code, body.message, body.details);
		}
	})
	.post("/data-mode", async (c) => {
		try {
			const payload = await c.req.json().catch(() => ({}));
			const { mode } = validate(SetDataModeSchema, payload);
			console.log("[ADMIN] POST /data-mode mode:", mode);
			await setDataMode(c.env, mode);
			return c.json({
				ok: true,
				mode,
				meta: buildDataModeMeta(mode),
			});
		} catch (error) {
			console.error("[ADMIN] POST /data-mode error:", error);
			const { status, body } = toApiErrorPayload(error, {
				code: "ADMIN_DATA_MODE_SET_FAILED",
				message: "Failed to update data mode",
			});
			return jsonError(c, status, body.code, body.message, body.details);
		}
	});
