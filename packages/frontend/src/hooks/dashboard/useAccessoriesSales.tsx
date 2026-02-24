import { useEffect, useState } from "react";
import { client } from "../../helpers/api";

interface AccessoriesSalesParams {
  role: string;
  userId: string;
  since?: string;
  until?: string;
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
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const response = await (
          client.api.evotor.accessoriesSales[":role"][":userId"] as any
        ).$post({
          param: {
            role: params.role,
            userId: params.userId,
          },
          json:
            params.since && params.until
              ? { since: params.since, until: params.until }
              : {},
        });
        if (!response.ok) {
          const err = await response.json().catch(() => null);
          const apiError = err as { error?: string; message?: string } | null;
          throw new Error(
            apiError?.error ||
              apiError?.message ||
              "Ошибка загрузки аксессуаров"
          );
        }
        const result = (await response.json()) as AccessoriesSalesData;
        if ("error" in result && result.error) {
          throw new Error(result.error);
        }
        setData(result);
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Ошибка запроса");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [params.role, params.userId, params.since, params.until]);

  return { data, loading, error };
}
