import type { D1Adapter } from "../../db-duckdb";
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
  db: D1Adapter,
  input: SaveAppEventInput,
) {
  await db.prepare(`
    INSERT INTO app_events (ts, event_name, user_id, shop_uuid, role, screen, trace_id, props_json, app_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    input.ts ?? Date.now(),
    input.eventName,
    input.userId ?? null,
    input.shopUuid ?? null,
    input.role ?? null,
    input.screen ?? null,
    input.traceId ?? null,
    input.props ? JSON.stringify(input.props) : null,
    input.appVersion ?? null,
  ).run();
}
