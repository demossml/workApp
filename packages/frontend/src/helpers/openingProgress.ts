export type StoreOpeningStep = "initial" | "photos" | "cash_check";

interface OpeningProgress {
  step: StoreOpeningStep;
  date: string; // YYYY-MM-DD
}

/**
 * Сохраняем шаг на сегодня
 */
export function saveProgress(step: StoreOpeningStep) {
  const today = new Date().toISOString().slice(0, 10);

  const data: OpeningProgress = {
    step,
    date: today,
  };

  localStorage.setItem("openingProgress", JSON.stringify(data));
}

/**
 * Загружаем шаг
 */
export function loadProgress(): OpeningProgress | null {
  try {
    const raw = localStorage.getItem("openingProgress");
    if (!raw) return null;

    return JSON.parse(raw) as OpeningProgress;
  } catch {
    return null;
  }
}

/**
 * Очистить прогресс (если нужен сброс)
 */
export function clearProgress() {
  localStorage.removeItem("openingProgress");
}
