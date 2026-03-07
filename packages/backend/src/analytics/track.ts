import type { IContext } from "../types";
import { logger } from "../logger";
import type { AppEventName } from "./events";
import { saveAppEvent } from "../db/repositories/appEvents";

export async function trackAppEvent(
	c: IContext,
	eventName: AppEventName,
	options?: {
		shopUuid?: string | null;
		role?: string | null;
		screen?: string | null;
		traceId?: string | null;
		props?: Record<string, unknown>;
		appVersion?: string | null;
		userId?: string | null;
	},
) {
	try {
		const drizzleDb = c.get("drizzle");
		await saveAppEvent(drizzleDb, {
			eventName,
			userId: options?.userId ?? c.var.userId ?? null,
			shopUuid: options?.shopUuid ?? null,
			role: options?.role ?? null,
			screen: options?.screen ?? null,
			traceId: options?.traceId ?? c.req.header("x-trace-id") ?? null,
			props: options?.props ?? null,
			appVersion: options?.appVersion ?? c.req.header("x-app-version") ?? null,
		});
	} catch (error) {
		logger.warn("Failed to track app event", {
			eventName,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}
