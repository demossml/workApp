import { useState, useEffect } from "react";
import PhotoUpload from "./PhotoUpload";
import type { StoreOpeningStep } from "../../pages/opening/types";

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
  // const [compressionQueue, setCompressionQueue] = useState<Set<string>>(
  //   new Set()
  // );
  const [isUploading, setIsUploading] = useState(false);

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
  const handleUploadSuccess = (fileKey: string) => {
    setFileUploadStatus((prev) => ({
      ...prev,
      [fileKey]: {
        ...prev[fileKey],
        progress: 100,
        status: "success",
      },
    }));

    setUploadedFiles((prev) => new Set(prev).add(fileKey));
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

          // setCompressionQueue((prev) => new Set(prev).add(fileKey));

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
                progress: 5, // 5% если сжатие пропущено
                status: "uploading",
              },
            }));
            // } finally {
            //   setCompressionQueue((prev) => {
            //     const newSet = new Set(prev);
            //     newSet.delete(fileKey);
            //     return newSet;
            //   });
          }

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

  // Переход на следующий шаг когда все загружено
  useEffect(() => {
    if (allRequiredPhotosUploaded && !isUploading) {
      const timer = setTimeout(() => {
        setCurrentStep("cash_check");
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [allRequiredPhotosUploaded, isUploading, setCurrentStep]);

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

      {/* Общая статистика загрузки */}
      {/* {uploadStats.total > 0 && (
        <div className="p-4 bg-blue-50 rounded-lg">
          <h3 className="font-medium text-blue-900 mb-2">Статус загрузки:</h3>
          <div className="grid grid-cols-5 gap-4 text-sm">
            <div className="text-center">
              <div className="text-blue-600 font-semibold">
                {uploadStats.total}
              </div>
              <div className="text-gray-600">Всего</div>
            </div>
            <div className="text-center">
              <div className="text-green-600 font-semibold">
                {uploadStats.success}
              </div>
              <div className="text-gray-600">Успешно</div>
            </div>
            <div className="text-center">
              <div className="text-blue-600 font-semibold">
                {uploadStats.uploading}
              </div>
              <div className="text-gray-600">Загружается</div>
            </div>
            <div className="text-center">
              <div className="text-yellow-600 font-semibold">
                {uploadStats.compressing}
              </div>
              <div className="text-gray-600">Сжимается</div>
            </div>
            <div className="text-center">
              <div className="text-red-600 font-semibold">
                {uploadStats.error}
              </div>
              <div className="text-gray-600">Ошибки</div>
            </div>
          </div>

          {allRequiredPhotosUploaded && (
            <div className="mt-3 p-2 bg-green-100 text-green-800 rounded text-center">
              ✅ Все фото успешно загружены! Переходим к следующему шагу...
            </div>
          )}
        </div>
      )} */}

      {/* Индикатор активной загрузки */}
      {isUploading && (
        <div className="fixed bottom-4 right-4 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg">
          ⏳ Идет загрузка фото...
        </div>
      )}
    </div>
  );
}
