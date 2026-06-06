import type { AppDB } from "../../db-duckdb.js";

export interface OpeningPhotoRecord {
  id: number;
  shop_uuid: string;
  user_id: string;
  date: string;
  category: string;
  file_id: string | null;
  file_unique_id: string | null;
  file_key: string | null;
  status: string;
  created_at: string;
}

let schemaEnsured = false;

export async function ensureOpeningPhotosSchema(db: AppDB): Promise<void> {
  if (schemaEnsured) return;
  await db
    .prepare("CREATE SEQUENCE IF NOT EXISTS opening_photos_seq START 1")
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS opening_photos (
        id INTEGER,
        shop_uuid TEXT NOT NULL,
        user_id TEXT NOT NULL,
        date TEXT NOT NULL,
        category TEXT NOT NULL,
        file_id TEXT,
        file_unique_id TEXT,
        file_key TEXT,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    )
    .run();
  // Migration: add status column if table existed from older schema
  try { await db.prepare("ALTER TABLE opening_photos ADD COLUMN status TEXT DEFAULT 'pending'").run(); } catch {}
  schemaEnsured = true;
}

export async function saveOpeningPhoto(
  db: AppDB,
  data: {
    shop_uuid: string;
    user_id: string;
    date: string;
    category: string;
    file_id: string;
    file_unique_id?: string;
    file_key?: string;
  }
): Promise<void> {
  await ensureOpeningPhotosSchema(db);
  await db
    .prepare(
      `INSERT INTO opening_photos (shop_uuid, user_id, date, category, file_id, file_unique_id, file_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      data.shop_uuid,
      data.user_id,
      data.date,
      data.category,
      data.file_id,
      data.file_unique_id ?? null,
      data.file_key ?? null
    )
    .run();
}

export async function getOpeningPhotos(
  db: AppDB,
  shopUuid: string,
  userId: string,
  date: string
): Promise<OpeningPhotoRecord[]> {
  await ensureOpeningPhotosSchema(db);
  const result = await db
    .prepare(
      `SELECT * FROM opening_photos
       WHERE shop_uuid = ? AND user_id = ? AND date = ?
       ORDER BY category, created_at`
    )
    .bind(shopUuid, userId, date)
    .all<OpeningPhotoRecord>();
  return result.results ?? [];
}

export async function deleteOpeningPhoto(
  db: AppDB,
  id: number
): Promise<{ deleted: boolean; file_key?: string | null }> {
  await ensureOpeningPhotosSchema(db);
  // Get file_key before deleting (for cleanup)
  const row = await db
    .prepare("SELECT file_key FROM opening_photos WHERE id = ?")
    .bind(id)
    .first<{ file_key: string | null }>();
  
  await db
    .prepare("DELETE FROM opening_photos WHERE id = ?")
    .bind(id)
    .run();
  
  return { deleted: true, file_key: row?.file_key ?? null };
}
