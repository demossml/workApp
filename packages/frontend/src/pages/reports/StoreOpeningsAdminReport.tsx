import { useEffect, useMemo, useState } from "react";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";
import { useEmployeeRole } from "../../hooks/useApi";
import { client } from "../../helpers/api";

interface OpeningsSummary {
  startDate: string;
  endDate: string;
  totalShops: number;
  openedShops: number;
  notOpenedShops: number;
  avgCompletion: number;
  withCashDiscrepancy: number;
  missingPhotos: number;
}

interface OpeningRecord {
  shopUuid: string;
  shopName: string;
  employeeId: string;
  employeeName: string;
  openedAt: string;
  photoCount: number;
  requiredPhotoCount: number;
  hasCashCheck: boolean;
  cashStatus: "not_checked" | "ok" | "surplus" | "shortage";
  cashMessage: string | null;
  completionPercent: number;
}

interface OpeningsReportResponse {
  summary: OpeningsSummary;
  records: OpeningRecord[];
}

interface OpeningPhoto {
  key: string;
  url: string;
  category: string;
}

const cashStatusLabel: Record<OpeningRecord["cashStatus"], string> = {
  not_checked: "Не проверена",
  ok: "Сходится",
  surplus: "Излишек",
  shortage: "Недостача",
};

export default function StoreOpeningsAdminReport() {
  useTelegramBackButton();

  const { data: roleData } = useEmployeeRole();
  const isSuperAdmin = roleData?.employeeRole === "SUPERADMIN";

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<OpeningsReportResponse | null>(null);
  const [previewRow, setPreviewRow] = useState<OpeningRecord | null>(null);
  const [previewPhotos, setPreviewPhotos] = useState<OpeningPhoto[]>([]);
  const [isPhotosLoading, setIsPhotosLoading] = useState(false);
  const [photosError, setPhotosError] = useState<string | null>(null);

  const categoryTitle: Record<string, string> = {
    area: "Территория",
    stock: "Витрина",
    cash: "Касса",
    mrc: "МРЦ",
    other: "Прочее",
  };

  const categoryOrder = ["area", "stock", "cash", "mrc", "other"];

  const loadReport = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await client.api.stores["openings-report"].$post({
        json: { startDate, endDate },
      });
      if (!response.ok) {
        throw new Error(`Ошибка загрузки отчета: ${response.status}`);
      }
      const data = (await response.json()) as OpeningsReportResponse;
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить отчет");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      void loadReport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin]);

  const loadPhotos = async (row: OpeningRecord) => {
    setPreviewRow(row);
    setIsPhotosLoading(true);
    setPhotosError(null);
    setPreviewPhotos([]);
    try {
      const response = await client.api.stores["opening-photos"].$post({
        json: {
          shopUuid: row.shopUuid,
          userId: row.employeeId,
          openedAt: row.openedAt,
        },
      });
      if (!response.ok) {
        throw new Error(`Ошибка загрузки фото: ${response.status}`);
      }
      const data = (await response.json()) as { photos?: OpeningPhoto[] };
      setPreviewPhotos(Array.isArray(data.photos) ? data.photos : []);
    } catch (err) {
      setPhotosError(err instanceof Error ? err.message : "Не удалось загрузить фото");
    } finally {
      setIsPhotosLoading(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="app-page p-4">
        <div className="max-w-3xl mx-auto rounded-xl bg-red-50 border border-red-200 p-4 text-red-700">
          Доступ только для SUPERADMIN.
        </div>
      </div>
    );
  }

  return (
    <div className="app-page p-4 pb-6 bg-custom-gray dark:bg-gray-900 text-gray-800 dark:text-gray-200">
      <div className="max-w-6xl mx-auto space-y-4">
        <h1 className="text-xl font-semibold">Отчет по открытиям магазинов</h1>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div>
            <label className="block text-sm mb-1">Дата с</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border p-2 bg-white dark:bg-gray-700"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Дата по</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border p-2 bg-white dark:bg-gray-700"
            />
          </div>
          <div className="md:col-span-2 flex items-end">
            <button
              onClick={() => void loadReport()}
              disabled={isLoading || endDate < startDate}
              className="w-full md:w-auto px-4 py-2 rounded-lg bg-blue-600 text-white disabled:bg-gray-400"
            >
              {isLoading ? "Загрузка..." : "Обновить отчет"}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {report?.summary && (
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="rounded-xl bg-white dark:bg-gray-800 p-3 border">Всего ТТ: {report.summary.totalShops}</div>
            <div className="rounded-xl bg-white dark:bg-gray-800 p-3 border">Открыто: {report.summary.openedShops}</div>
            <div className="rounded-xl bg-white dark:bg-gray-800 p-3 border">Не открыто: {report.summary.notOpenedShops}</div>
            <div className="rounded-xl bg-white dark:bg-gray-800 p-3 border">Средний %: {report.summary.avgCompletion}%</div>
            <div className="rounded-xl bg-white dark:bg-gray-800 p-3 border">Проблемы кассы: {report.summary.withCashDiscrepancy}</div>
            <div className="rounded-xl bg-white dark:bg-gray-800 p-3 border">Недобор фото: {report.summary.missingPhotos}</div>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 dark:bg-gray-700">
              <tr>
                <th className="text-left p-2">Магазин</th>
                <th className="text-left p-2">Сотрудник</th>
                <th className="text-left p-2">Открыт</th>
                <th className="text-left p-2">Фото</th>
                <th className="text-left p-2">Просмотр</th>
                <th className="text-left p-2">Касса</th>
                <th className="text-left p-2">Выполнение</th>
              </tr>
            </thead>
            <tbody>
              {report?.records?.length ? (
                report.records.map((row) => (
                  <tr key={`${row.shopUuid}-${row.openedAt}`} className="border-t border-gray-200 dark:border-gray-700">
                    <td className="p-2">{row.shopName}</td>
                    <td className="p-2">{row.employeeName}</td>
                    <td className="p-2">{new Date(row.openedAt).toLocaleString("ru-RU")}</td>
                    <td className="p-2">{row.photoCount}/{row.requiredPhotoCount}</td>
                    <td className="p-2">
                      <button
                        type="button"
                        onClick={() => void loadPhotos(row)}
                        className="px-2 py-1 rounded-md bg-blue-600 text-white text-xs"
                      >
                        Смотреть фото
                      </button>
                    </td>
                    <td className="p-2">{cashStatusLabel[row.cashStatus]}{row.cashMessage ? ` (${row.cashMessage})` : ""}</td>
                    <td className="p-2">{row.completionPercent}%</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-gray-500">
                    Нет данных за выбранный период
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {previewRow && (
        <div className="fixed inset-0 z-[70] bg-black/50 p-4 overflow-y-auto">
          <div className="max-w-5xl mx-auto bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Фото открытия: {previewRow.shopName}
              </h2>
              <button
                type="button"
                onClick={() => setPreviewRow(null)}
                className="px-3 py-1 rounded-md bg-gray-200 dark:bg-gray-700"
              >
                Закрыть
              </button>
            </div>

            {isPhotosLoading && (
              <div className="text-sm text-gray-500">Загрузка фото...</div>
            )}

            {photosError && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {photosError}
              </div>
            )}

            {!isPhotosLoading && !photosError && previewPhotos.length === 0 && (
              <div className="text-sm text-gray-500">Фото не найдены</div>
            )}

            {previewPhotos.length > 0 && (
              <div className="space-y-4">
                {categoryOrder.map((category) => {
                  const categoryPhotos = previewPhotos.filter(
                    (photo) => (photo.category || "other") === category,
                  );
                  if (!categoryPhotos.length) return null;

                  return (
                    <div key={category} className="space-y-2">
                      <h3 className="text-sm font-semibold">
                        {categoryTitle[category] || category}
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {categoryPhotos.map((photo, idx) => {
                          const slotLabel =
                            category === "area"
                              ? `Территория #${idx + 1}`
                              : category === "stock"
                                ? `Витрина #${idx + 1}`
                                : category === "cash"
                                  ? "Касса"
                                  : category === "mrc"
                                    ? "МРЦ"
                                    : `Фото #${idx + 1}`;

                          return (
                            <a
                              key={photo.key}
                              href={photo.url}
                              target="_blank"
                              rel="noreferrer"
                              className="block rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
                            >
                              <img
                                src={photo.url}
                                alt={slotLabel}
                                className="w-full h-40 object-cover"
                                loading="lazy"
                              />
                              <div className="px-2 py-1 text-xs text-gray-600 dark:text-gray-300">
                                {slotLabel}
                              </div>
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
