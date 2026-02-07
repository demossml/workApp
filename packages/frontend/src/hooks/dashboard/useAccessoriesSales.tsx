import { useEffect, useState } from "react";
import axios from "axios";

interface AccessoriesSalesParams {
  role: string;
  userId: string;
  since?: string; // ISO-строка даты начала
  until?: string; // ISO-строка даты конца
}

export interface AccessoriesSalesData {
  byShop: Array<{
    shopId: string;
    shopName: string;
    sales: Array<{
      name: string;
      quantity: number;
      sum: number;
    }>;
  }>;
  total: Array<{
    name: string;
    quantity: number;
    sum: number;
  }>;
  error?: string;
}

export function useAccessoriesSales(params: AccessoriesSalesParams) {
  const [data, setData] = useState<AccessoriesSalesData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.role || !params.userId) return;
    console.log("[useAccessoriesSales] Запрос аксессуаров", params);
    setLoading(true);
    setError(null);
    axios
      .post(
        `/api/evotor/accessories-sales:role/${params.role}/userId:${params.userId}`,
        {
          role: params.role,
          userId: params.userId,
          since: params.since,
          until: params.until,
        }
      )
      .then((response) => {
        console.log("[useAccessoriesSales] Ответ аксессуаров", response.data);
        setData(response.data);
      })
      .catch((err) => {
        console.error("[useAccessoriesSales] Ошибка запроса", err);
        setError(err.message || "Ошибка запроса");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [params.role, params.userId, params.since, params.until]);

  return { data, loading, error };
}
