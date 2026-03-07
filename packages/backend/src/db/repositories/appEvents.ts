import type { DrizzleD1Database } from "drizzle-orm/d1";
import { appEvents } from "../schema/appEvents";
import type { AppEventName } from "../../analytics/events";

export interface SaveAppEventInput {
	eventName: AppEventName;
	userId?: string | null;
	shopUuid?: string | null;
	role?: string | null;
	screen?: string | null;
	traceId?: string | null;
	props?: Record<string, unknown> | null;
	appVersion?: string | null;
	ts?: number;
}

export async function saveAppEvent(
	db: DrizzleD1Database<Record<string, unknown>>,
	input: SaveAppEventInput,
) {
	await db
		.insert(appEvents)
		.values({
			ts: input.ts ?? Date.now(),
			eventName: input.eventName,
			userId: input.userId ?? null,
			shopUuid: input.shopUuid ?? null,
			role: input.role ?? null,
			screen: input.screen ?? null,
			traceId: input.traceId ?? null,
			propsJson: input.props ? JSON.stringify(input.props) : null,
			appVersion: input.appVersion ?? null,
		})
		.run();
}
