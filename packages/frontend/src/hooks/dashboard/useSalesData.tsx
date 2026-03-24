import { useEffect, useState, useRef } from "react";
import type { SalesData } from "../../widgets/dashboard/type";
import { fetchFinancialMetrics } from "@shared/api";

interface UseSalesDataParams {
  since?: string;
  until?: string;
  shopUuid?: string;
  enabled?: boolean;
}

interface UseSalesDataReturn {
  data: SalesData | null;
  loading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  isUpdating: boolean;
}

/**
 * Хук для получения финансовых данных.
 *
 * Логика:
 * - Если переданы since и until → GET /financial?since&until
 * - Если нет → GET /financial/today
 * - Автообновление раз в 60 секунд
 */
export function useSalesData(params?: UseSalesDataParams): UseSalesDataReturn {
  const [data, setData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (params?.enabled === false) {
      setLoading(false);
      setIsUpdating(false);
      return;
    }
    let isMounted = true;

    const fetchData = async () => {
      // Отменяем предыдущий запрос (если был)
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsUpdating(true);
      setError(null);

      try {
        const json = (await fetchFinancialMetrics({
          since: params?.since,
          until: params?.until,
          shopUuid: params?.shopUuid,
        })) as SalesData;

        if (controller.signal.aborted) {
          return;
        }

        if (isMounted) {
          setData(json);
          setLastUpdate(new Date());
        }
      } catch (err) {
        if (isMounted && err instanceof Error && err.name !== "AbortError") {
          setError(err.message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
          setTimeout(() => setIsUpdating(false), 500);
        }
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 60000);

    return () => {
      isMounted = false;
      abortRef.current?.abort();
      clearInterval(interval);
    };
  }, [params?.since, params?.until, params?.shopUuid, params?.enabled]);

  return { data, loading, error, lastUpdate, isUpdating };
}
