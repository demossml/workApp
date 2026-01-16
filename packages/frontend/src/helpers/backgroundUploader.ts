/**
 * Фоновый загрузчик файлов из очереди
 * Автоматически загружает файлы при открытии приложения
 */

import {
  getPendingFiles,
  updateFileStatus,
  removeFromQueue,
  cleanOldEntries,
} from "./uploadQueue";

// Функция для загрузки одного файла
const uploadFile = async (
  fileData: Blob,
  fileName: string,
  category: string,
  userId: string,
  fileKey: string,
  onProgress?: (progress: number) => void
): Promise<boolean> => {
  try {
    const formData = new FormData();

    // Создаем File объект из Blob
    const file = new File([fileData], fileName, { type: fileData.type });

    formData.append("file", file);
    formData.append("category", category);
    formData.append("userId", userId);
    formData.append("fileKey", fileKey);

    await updateFileStatus(fileKey, "uploading");

    return new Promise<boolean>((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      if (onProgress) {
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            onProgress(progress);
          }
        });
      }

      xhr.onload = async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            if (response.success) {
              await removeFromQueue(fileKey);
              resolve(true);
            } else {
              await updateFileStatus(fileKey, "error", true);
              reject(new Error("Upload failed - server error"));
            }
          } catch {
            await updateFileStatus(fileKey, "error", true);
            reject(new Error("Invalid server response"));
          }
        } else {
          await updateFileStatus(fileKey, "error", true);
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = async () => {
        await updateFileStatus(fileKey, "error", true);
        reject(new Error("Network error during upload"));
      };

      xhr.open("POST", "/api/upload-photos");
      xhr.send(formData);
    });
  } catch (error) {
    console.error("❌ Ошибка загрузки файла:", error);
    await updateFileStatus(fileKey, "error", true);
    return false;
  }
};

/**
 * Запустить фоновую загрузку для пользователя
 */
export const startBackgroundUpload = async (
  userId: string,
  onProgress?: (uploaded: number, total: number) => void
): Promise<{ uploaded: number; failed: number }> => {
  console.log("🚀 Запуск фоновой загрузки файлов...");

  // Очистка старых записей (старше 7 дней)
  await cleanOldEntries();

  // Получаем файлы в ожидании
  const pendingFiles = await getPendingFiles(userId);

  if (pendingFiles.length === 0) {
    console.log("✅ Нет файлов в очереди");
    return { uploaded: 0, failed: 0 };
  }

  console.log(`📦 Найдено файлов в очереди: ${pendingFiles.length}`);

  let uploaded = 0;
  let failed = 0;

  // Ограничение попыток загрузки
  const MAX_ATTEMPTS = 3;

  for (const queuedFile of pendingFiles) {
    // Пропускаем файлы с превышенным лимитом попыток
    if (queuedFile.attempts >= MAX_ATTEMPTS) {
      console.warn(
        `⚠️ Пропуск файла ${queuedFile.fileName} - слишком много попыток`
      );
      await updateFileStatus(queuedFile.fileKey, "error");
      failed++;
      continue;
    }

    try {
      const success = await uploadFile(
        queuedFile.fileData,
        queuedFile.fileName,
        queuedFile.category,
        queuedFile.userId,
        queuedFile.fileKey,
        (progress) => {
          console.log(`📤 ${queuedFile.fileName}: ${progress}%`);
        }
      );

      if (success) {
        uploaded++;
        console.log(`✅ Загружен: ${queuedFile.fileName}`);
      } else {
        failed++;
        console.error(`❌ Не удалось загрузить: ${queuedFile.fileName}`);
      }

      // Обновляем прогресс
      if (onProgress) {
        onProgress(uploaded, pendingFiles.length);
      }

      // Небольшая задержка между загрузками
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      failed++;
      console.error(`❌ Ошибка загрузки ${queuedFile.fileName}:`, error);
    }
  }

  console.log(`
📊 Результаты фоновой загрузки:
   ✅ Загружено: ${uploaded}
   ❌ Ошибок: ${failed}
   📁 Всего: ${pendingFiles.length}
  `);

  return { uploaded, failed };
};

/**
 * Проверить наличие файлов в очереди
 */
export const hasFilesInQueue = async (userId: string): Promise<boolean> => {
  const pendingFiles = await getPendingFiles(userId);
  return pendingFiles.length > 0;
};

/**
 * Получить количество файлов в очереди
 */
export const getQueueCount = async (userId: string): Promise<number> => {
  const pendingFiles = await getPendingFiles(userId);
  return pendingFiles.length;
};
