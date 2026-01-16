import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import PhotoUpload from "./PhotoUpload";
import type { StoreOpeningStep } from "../../pages/opening/types";
import {
  addToUploadQueue,
  removeFromQueue,
  updateFileStatus,
  getPendingFiles,
} from "../../helpers/uploadQueue";

interface PhotoStepProps {
  setCurrentStep: React.Dispatch<React.SetStateAction<StoreOpeningStep>>;
  userId: string;
}

export interface PhotoFiles {
  area: File[];
  stock: File[];
  cash: File[];
  mrc: File[];
}

interface FileUploadStatus {
  [fileName: string]: {
    progress: number;
    status: "compressing" | "uploading" | "success" | "error";
    category: keyof PhotoFiles;
  };
}

// Функция для сжатия изображения в AVIF
const compressImage = async (file: File, quality = 0.5): Promise<File> => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      resolve(file);
      return;
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      // Оптимальные настройки для фотографий магазина
      const MAX_WIDTH = 1200;
      const MAX_HEIGHT = 800;

      let { width, height } = img;

      // Масштабируем если изображение слишком большое
      if (width > MAX_WIDTH || height > MAX_HEIGHT) {
        const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
        width *= ratio;
        height *= ratio;
      }

      canvas.width = width;
      canvas.height = height;

      ctx?.drawImage(img, 0, 0, width, height);

      // Конвертируем в AVIF
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const compressedFile = new File(
              [blob],
              file.name.replace(/\.[^/.]+$/, ".avif"),
              { type: "image/avif" }
            );
            resolve(compressedFile);
          } else {
            // Если AVIF не поддерживается, используем оригинальный файл
            console.warn("AVIF compression failed, using original file");
            resolve(file);
          }
        },
        "image/avif",
        quality
      );
    };

    img.onerror = () => {
      reject(new Error("Image loading failed"));
    };

    img.src = URL.createObjectURL(file);
  });
};

// Функция для загрузки одного файла
const uploadSingleFile = async (
  file: File,
  category: keyof PhotoFiles,
  fileKey: string,
  userId: string,
  onProgress: (fileKey: string, progress: number) => void,
  onSuccess: (fileKey: string) => void,
  onError: (fileKey: string) => void
): Promise<void> => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", category);
  formData.append("userId", userId);
  formData.append("fileKey", fileKey); // ← ОБЯЗАТЕЛЬНО

  try {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        const progress = Math.round((event.loaded / event.total) * 100);
        onProgress(fileKey, progress);
      }
    });

    await new Promise<void>((resolve, reject) => {
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            if (response.success) {
              onSuccess(fileKey);
              resolve();
            } else {
              onError(fileKey);
              reject(new Error("Upload failed - server error"));
            }
          } catch {
            onError(fileKey);
            reject(new Error("Invalid server response"));
          }
        } else {
          onError(fileKey);
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => {
        onError(fileKey);
        reject(new Error("Network error during upload"));
      };

      xhr.open("POST", "/api/upload-photos");
      xhr.send(formData);
    });
  } catch (error) {
    console.error("❌ Ошибка загрузки файла:", error);
    onError(fileKey);
    throw error;
  }
};

// Функция для ограничения количества одновременных промисов
const limitConcurrency = async <T,>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> => {
  const results: T[] = [];
  const executing = new Set<Promise<T>>();

  for (const task of tasks) {
    const p = task().then((result) => {
      results.push(result);
      executing.delete(p);
      return result;
    });

    executing.add(p);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
};

export default function PhotoStep({ setCurrentStep, userId }: PhotoStepProps) {
  const [photos, setPhotos] = useState<PhotoFiles>({
    area: [],
    stock: [],
    cash: [],
    mrc: [],
  });

  const [fileUploadStatus, setFileUploadStatus] = useState<FileUploadStatus>(
    {}
  );
  const [uploadedFiles, setUploadedFiles] = useState<Set<string>>(new Set());
  const [isUploading, setIsUploading] = useState(false);
  const [canProceed, setCanProceed] = useState(false);

  // Функция для создания уникального ключа файла
  const createFileKey = (
    file: File,
    category: keyof PhotoFiles,
    index: number
  ): string => {
    return `${category}_${file.name}_${file.size}_${file.lastModified}_${index}`;
  };

  // Функция для обработки прогресса загрузки
  const handleUploadProgress = (fileKey: string, progress: number) => {
    setFileUploadStatus((prev) => ({
      ...prev,
      [fileKey]: {
        ...prev[fileKey],
        progress: Math.max(prev[fileKey]?.progress || 0, progress), // Не уменьшаем прогресс
      },
    }));
  };

  // Функция для обработки успешной загрузки
  const handleUploadSuccess = async (fileKey: string) => {
    setFileUploadStatus((prev) => ({
      ...prev,
      [fileKey]: {
        ...prev[fileKey],
        progress: 100,
        status: "success",
      },
    }));

    setUploadedFiles((prev) => new Set(prev).add(fileKey));

    // Удаляем из очереди после успешной загрузки
    await removeFromQueue(fileKey);
  };

  // Функция для обработки ошибки загрузки
  const handleUploadError = (fileKey: string) => {
    setFileUploadStatus((prev) => ({
      ...prev,
      [fileKey]: {
        ...prev[fileKey],
        status: "error",
      },
    }));
  };

  // Обработчик изменения файлов в категории
  const handleFilesChange = async (
    files: File[],
    category: keyof PhotoFiles
  ) => {
    setPhotos((prev) => ({
      ...prev,
      [category]: files,
    }));

    // Запускаем обработку новых файлов
    await processAndUploadFiles(files, category);
  };

  // Основная функция для обработки и загрузки файлов
  const processAndUploadFiles = async (
    files: File[],
    category: keyof PhotoFiles
  ) => {
    setIsUploading(true);

    try {
      // Создаем задачи для каждого файла
      const uploadTasks = files.map((file, index) => {
        const fileKey = createFileKey(file, category, index);

        return async (): Promise<string> => {
          // Пропускаем уже загруженные файлы
          if (
            uploadedFiles.has(fileKey) ||
            fileUploadStatus[fileKey]?.status === "success"
          ) {
            return fileKey;
          }

          // Пропускаем файлы в процессе загрузки
          if (
            fileUploadStatus[fileKey]?.status === "uploading" ||
            fileUploadStatus[fileKey]?.status === "compressing"
          ) {
            return fileKey;
          }

          // Устанавливаем статус сжатия
          setFileUploadStatus((prev) => ({
            ...prev,
            [fileKey]: {
              progress: 0,
              status: "compressing",
              category,
            },
          }));

          // Добавляем файл в очередь IndexedDB
          await addToUploadQueue(file, category, userId, fileKey);

          let compressedFile: File;
          try {
            // Сжимаем файл
            compressedFile = await compressImage(file);

            // Обновляем прогресс после сжатия
            setFileUploadStatus((prev) => ({
              ...prev,
              [fileKey]: {
                ...prev[fileKey],
                progress: 10, // 10% после сжатия
                status: "uploading",
              },
            }));
          } catch (compressionError) {
            console.warn(
              "Сжатие не удалось, используем оригинальный файл:",
              compressionError
            );
            compressedFile = file;

            setFileUploadStatus((prev) => ({
              ...prev,
              [fileKey]: {
                ...prev[fileKey],
                progress: 5,
                status: "uploading",
              },
            }));
          }

          // Обновляем статус в очереди
          await updateFileStatus(fileKey, "uploading");

          // Загружаем файл
          await uploadSingleFile(
            compressedFile,
            category,
            fileKey,
            userId,
            handleUploadProgress,
            handleUploadSuccess,
            handleUploadError
          );

          return fileKey;
        };
      });

      // Запускаем загрузку с ограничением параллелизма (макс 2 одновременные загрузки)
      await limitConcurrency(uploadTasks, 2);
    } catch (error) {
      console.error("❌ Ошибка в процессе загрузки:", error);
    } finally {
      setIsUploading(false);
    }
  };

  // Получаем статус для отображения в PhotoUpload
  const getFilesUploadStatus = (files: File[], category: keyof PhotoFiles) => {
    return files.map((file, index) => {
      const fileKey = createFileKey(file, category, index);
      const status = fileUploadStatus[fileKey];

      if (status) {
        return status;
      }

      // Если статуса нет, проверяем не загружен ли уже файл
      if (uploadedFiles.has(fileKey)) {
        return {
          progress: 100,
          status: "success" as const,
          category,
        };
      }

      // Статус по умолчанию
      return {
        progress: 0,
        status: "compressing" as const,
        category,
      };
    });
  };

  // Проверяем, все ли обязательные фото загружены
  const allRequiredPhotosUploaded =
    photos.area.length >= 2 &&
    photos.area.slice(0, 2).every((file, index) => {
      const fileKey = createFileKey(file, "area", index);
      return fileUploadStatus[fileKey]?.status === "success";
    }) &&
    photos.stock.length >= 3 &&
    photos.stock.slice(0, 3).every((file, index) => {
      const fileKey = createFileKey(file, "stock", index);
      return fileUploadStatus[fileKey]?.status === "success";
    }) &&
    photos.cash.length >= 1 &&
    photos.cash.slice(0, 1).every((file, index) => {
      const fileKey = createFileKey(file, "cash", index);
      return fileUploadStatus[fileKey]?.status === "success";
    }) &&
    photos.mrc.length >= 1 &&
    photos.mrc.slice(0, 1).every((file, index) => {
      const fileKey = createFileKey(file, "mrc", index);
      return fileUploadStatus[fileKey]?.status === "success";
    });

  // Проверка минимальных требований для продолжения
  const minRequirementsMet =
    photos.area.length >= 1 &&
    photos.stock.length >= 2 &&
    photos.cash.length >= 1 &&
    photos.mrc.length >= 1;

  // Обновляем возможность продолжения
  useEffect(() => {
    setCanProceed(minRequirementsMet && !isUploading);
  }, [minRequirementsMet, isUploading]);

  // Функция перехода на следующий шаг
  const handleProceed = async () => {
    // Сохраняем незагруженные файлы в очередь для фоновой загрузки
    const pendingFiles = await getPendingFiles(userId);
    console.log(`📦 Незагруженных файлов в очереди: ${pendingFiles.length}`);

    setCurrentStep("cash_check");
  };

  // Статистика загрузки для отображения
  // const uploadStats = {
  //   total: Object.keys(fileUploadStatus).length,
  //   success: Object.values(fileUploadStatus).filter(
  //     (status) => status.status === "success"
  //   ).length,
  //   error: Object.values(fileUploadStatus).filter(
  //     (status) => status.status === "error"
  //   ).length,
  //   uploading: Object.values(fileUploadStatus).filter(
  //     (status) => status.status === "uploading"
  //   ).length,
  //   compressing: compressionQueue.size,
  // };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Сделайте фотографии:</h2>

      <div className="space-y-4">
        <PhotoUpload
          label="Территория магазина (2 фото)"
          maxFiles={2}
          files={photos.area}
          uploadStatuses={getFilesUploadStatus(photos.area, "area")}
          onChange={(files) => handleFilesChange(files, "area")}
        />

        <PhotoUpload
          label="Запасы товаров / Витрина (3 фото)"
          maxFiles={3}
          files={photos.stock}
          uploadStatuses={getFilesUploadStatus(photos.stock, "stock")}
          onChange={(files) => handleFilesChange(files, "stock")}
        />

        <PhotoUpload
          label="Состояние кассы (1 фото)"
          maxFiles={1}
          files={photos.cash}
          uploadStatuses={getFilesUploadStatus(photos.cash, "cash")}
          onChange={(files) => handleFilesChange(files, "cash")}
        />

        <PhotoUpload
          label="Фото МРЦ (1 фото)"
          maxFiles={1}
          files={photos.mrc}
          uploadStatuses={getFilesUploadStatus(photos.mrc, "mrc")}
          onChange={(files) => handleFilesChange(files, "mrc")}
        />
      </div>

      {/* Статус загрузки */}
      {Object.keys(fileUploadStatus).length > 0 && (
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-blue-900 dark:text-blue-100">
              Статус загрузки
            </h3>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {
                Object.values(fileUploadStatus).filter(
                  (s) => s.status === "success"
                ).length
              }{" "}
              / {Object.keys(fileUploadStatus).length}
            </div>
          </div>

          {/* Прогресс бар */}
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-3">
            <motion.div
              className="bg-blue-600 h-2 rounded-full"
              initial={{ width: 0 }}
              animate={{
                width: `${
                  (Object.values(fileUploadStatus).filter(
                    (s) => s.status === "success"
                  ).length /
                    Object.keys(fileUploadStatus).length) *
                  100
                }%`,
              }}
              transition={{ duration: 0.3 }}
            />
          </div>

          {/* Информация о незагруженных */}
          {!allRequiredPhotosUploaded && minRequirementsMet && (
            <div className="text-xs text-amber-600 dark:text-amber-400">
              ⚠️ Некоторые фото еще загружаются. Вы можете продолжить - загрузка
              продолжится в фоне.
            </div>
          )}
        </div>
      )}

      {/* Кнопка продолжения */}
      {minRequirementsMet && (
        <motion.button
          onClick={handleProceed}
          disabled={!canProceed}
          className={`w-full py-3 rounded-xl shadow font-medium transition-colors ${
            canProceed
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-gray-300 text-gray-500 cursor-not-allowed"
          }`}
          whileTap={canProceed ? { scale: 0.97 } : {}}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {isUploading
            ? "Загрузка... Можно продолжить"
            : allRequiredPhotosUploaded
              ? "Все готово! Продолжить"
              : "Продолжить (загрузка в фоне)"}
        </motion.button>
      )}

      {!minRequirementsMet && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-sm text-amber-700 dark:text-amber-300">
          📸 Загрузите минимум: 1 фото территории, 2 фото витрины, 1 фото кассы,
          1 фото МРЦ
        </div>
      )}

      {/* Индикатор активной загрузки */}
      {isUploading && (
        <div className="fixed bottom-4 right-4 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg">
          ⏳ Идет загрузка фото...
        </div>
      )}
    </div>
  );
}
