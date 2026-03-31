import { z } from "zod";
import { ApiError } from "./errors";
import type { IEnv } from "./types";

export const DataModeSchema = z.enum(["DB", "ELVATOR"]);

export type DataMode = z.infer<typeof DataModeSchema>;

export type DataModeMeta = {
	source: DataMode;
	aiAvailable: boolean;
};

export const DataModeMetaSchema = z.object({
	source: DataModeSchema,
	aiAvailable: z.boolean(),
});

const DEFAULT_DATA_MODE: DataMode = "ELVATOR";
const DATA_MODE_KV_KEY = "app:data_mode";

function isDataMode(value: string): value is DataMode {
	return value === "DB" || value === "ELVATOR";
}

function requireDb(env: Pick<IEnv["Bindings"], "DB">) {
	const db = env.DB;
	if (!db) {
		throw new ApiError(
			500,
			"DB_NOT_CONFIGURED",
			"D1 database is required for data mode storage",
		);
	}
	return db;
}

async function getModeFromKv(
	env: Pick<IEnv["Bindings"], "KV">,
): Promise<DataMode | null> {
	const kv = env.KV;
	if (!kv) return null;
	try {
		const raw = await kv.get(DATA_MODE_KV_KEY);
		if (!raw) return null;
		return isDataMode(raw) ? raw : null;
	} catch (error) {
		console.error("[dataMode] KV read failed:", error);
		return null;
	}
}

async function setModeToKv(
	env: Pick<IEnv["Bindings"], "KV">,
	mode: DataMode,
): Promise<void> {
	const kv = env.KV;
	if (!kv) return;
	try {
		await kv.put(DATA_MODE_KV_KEY, mode, { expirationTtl: 60 * 60 * 24 * 365 });
	} catch (error) {
		console.error("[dataMode] KV write failed:", error);
	}
}

export function buildDataModeMeta(mode: DataMode): DataModeMeta {
	return {
		source: mode,
		aiAvailable: mode === "DB",
	};
}

export async function getDataMode(
	env: Pick<IEnv["Bindings"], "DB" | "KV">,
): Promise<DataMode> {
	try {
		const db = requireDb(env);
		const result = await db
			.prepare("SELECT mode FROM data_mode WHERE id = 1")
			.first<{ mode: string }>();

		if (!result || !result.mode) {
			const kvMode = await getModeFromKv(env);
			return kvMode ?? DEFAULT_DATA_MODE;
		}
		return isDataMode(result.mode)
			? (result.mode as DataMode)
			: DEFAULT_DATA_MODE;
	} catch (error) {
		console.error("[dataMode] Error reading from D1:", error);
		const kvMode = await getModeFromKv(env);
		return kvMode ?? DEFAULT_DATA_MODE;
	}
}

export async function setDataMode(
	env: Pick<IEnv["Bindings"], "DB" | "KV">,
	mode: DataMode,
): Promise<DataMode> {
	// Only write to DB if mode changed to avoid unnecessary operations
	const currentMode = await getDataMode(env);
	console.log(
		"[dataMode] setDataMode currentMode:",
		currentMode,
		"newMode:",
		mode,
	);

	if (currentMode !== mode) {
		console.log("[dataMode] Mode changed, writing to D1");
		try {
			const db = requireDb(env);
			await db
				.prepare(
					"INSERT INTO data_mode (id, mode) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET mode = ?",
				)
				.bind(mode, mode)
				.run();
			await setModeToKv(env, mode);
			console.log("[dataMode] Successfully wrote to D1");
		} catch (error) {
			console.error("[dataMode] Error writing to D1:", error);
			if (env.KV) {
				console.log("[dataMode] Falling back to KV mode storage");
				await setModeToKv(env, mode);
			} else {
				throw new ApiError(
					500,
					"DB_WRITE_FAILED",
					"Failed to update data mode in database",
				);
			}
		}
	} else {
		console.log("[dataMode] Mode unchanged, skipping DB write");
	}

	return mode;
}

export async function getDataModeOrDefault(
	env: Pick<IEnv["Bindings"], "DB" | "KV">,
): Promise<DataMode> {
	try {
		return await getDataMode(env);
	} catch {
		return DEFAULT_DATA_MODE;
	}
}
