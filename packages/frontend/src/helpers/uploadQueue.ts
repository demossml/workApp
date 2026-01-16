/**
 * Управление очередью загрузки фото для открытия магазина
 * Сохраняет файлы в IndexedDB для фоновой загрузки
 */

interface QueuedFile {
  fileData: Blob;
  fileName: string;
  fileSize: number;
  category: "area" | "stock" | "cash" | "mrc";
  userId: string;
  fileKey: string;
  timestamp: number;
  attempts: number;
  status: "pending" | "uploading" | "success" | "error";
}

const DB_NAME = "StoreOpeningDB";
const DB_VERSION = 1;
const STORE_NAME = "uploadQueue";

// Открытие/создание базы данных IndexedDB
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, {
          keyPath: "fileKey",
        });
        objectStore.createIndex("userId", "userId", { unique: false });
        objectStore.createIndex("status", "status", { unique: false });
        objectStore.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });
};

/**
 * Добавить файл в очередь загрузки
 */
export const addToUploadQueue = async (
  file: File,
  category: "area" | "stock" | "cash" | "mrc",
  userId: string,
  fileKey: string
): Promise<void> => {
  try {
    const db = await openDB();

    const queuedFile: QueuedFile = {
      fileData: file,
      fileName: file.name,
      fileSize: file.size,
      category,
      userId,
      fileKey,
      timestamp: Date.now(),
      attempts: 0,
      status: "pending",
    };

    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    await new Promise<void>((resolve, reject) => {
      const request = store.put(queuedFile);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();
  } catch (error) {
    console.error("❌ Ошибка добавления в очередь:", error);
    throw error;
  }
};

/**
 * Получить все файлы из очереди для пользователя
 */
export const getUploadQueue = async (userId: string): Promise<QueuedFile[]> => {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("userId");

    const files: QueuedFile[] = await new Promise((resolve, reject) => {
      const request = index.getAll(userId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    db.close();
    return files;
  } catch (error) {
    console.error("❌ Ошибка получения очереди:", error);
    return [];
  }
};

/**
 * Получить только незагруженные файлы
 */
export const getPendingFiles = async (
  userId: string
): Promise<QueuedFile[]> => {
  const allFiles = await getUploadQueue(userId);
  return allFiles.filter(
    (file) => file.status === "pending" || file.status === "error"
  );
};

/**
 * Обновить статус файла в очереди
 */
export const updateFileStatus = async (
  fileKey: string,
  status: QueuedFile["status"],
  incrementAttempts = false
): Promise<void> => {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const file: QueuedFile = await new Promise((resolve, reject) => {
      const request = store.get(fileKey);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    if (file) {
      file.status = status;
      if (incrementAttempts) {
        file.attempts += 1;
      }

      await new Promise<void>((resolve, reject) => {
        const request = store.put(file);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    db.close();
  } catch (error) {
    console.error("❌ Ошибка обновления статуса:", error);
  }
};

/**
 * Удалить файл из очереди после успешной загрузки
 */
export const removeFromQueue = async (fileKey: string): Promise<void> => {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    await new Promise<void>((resolve, reject) => {
      const request = store.delete(fileKey);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();
  } catch (error) {
    console.error("❌ Ошибка удаления из очереди:", error);
  }
};

/**
 * Очистить всю очередь для пользователя
 */
export const clearUploadQueue = async (userId: string): Promise<void> => {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("userId");

    const files: QueuedFile[] = await new Promise((resolve, reject) => {
      const request = index.getAll(userId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    for (const file of files) {
      await new Promise<void>((resolve, reject) => {
        const request = store.delete(file.fileKey);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    db.close();
  } catch (error) {
    console.error("❌ Ошибка очистки очереди:", error);
  }
};

/**
 * Получить статистику загрузки
 */
export const getUploadStats = async (
  userId: string
): Promise<{
  total: number;
  pending: number;
  uploading: number;
  success: number;
  error: number;
  byCategory: Record<string, number>;
}> => {
  const files = await getUploadQueue(userId);

  const stats = {
    total: files.length,
    pending: files.filter((f) => f.status === "pending").length,
    uploading: files.filter((f) => f.status === "uploading").length,
    success: files.filter((f) => f.status === "success").length,
    error: files.filter((f) => f.status === "error").length,
    byCategory: {} as Record<string, number>,
  };

  // Подсчет по категориям
  files.forEach((file) => {
    stats.byCategory[file.category] =
      (stats.byCategory[file.category] || 0) + 1;
  });

  return stats;
};

/**
 * Очистить старые записи (старше 7 дней)
 */
export const cleanOldEntries = async (): Promise<void> => {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const allFiles: QueuedFile[] = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    for (const file of allFiles) {
      if (file.timestamp < sevenDaysAgo) {
        await new Promise<void>((resolve, reject) => {
          const request = store.delete(file.fileKey);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      }
    }

    db.close();
  } catch (error) {
    console.error("❌ Ошибка очистки старых записей:", error);
  }
};
