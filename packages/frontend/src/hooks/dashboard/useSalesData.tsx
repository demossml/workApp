import { useEffect, useState } from "react";
import type { SalesData } from "../../components/dashboard/type";

export function useSalesData(params?: { since?: string; until?: string }) {
  const [data, setData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setIsUpdating(true);
      try {
        let url = "/api/evotor/report/financial/today";
        let method = "GET";

        // Если переданы параметры периода, используем POST
        if (params?.since || params?.until) {
          const q = new URLSearchParams();
          if (params.since) q.append("since", params.since);
          if (params.until) q.append("until", params.until);
          url = `/api/evotor/report/financial?${q.toString()}`;
          method = "POST";
        }

        const res = await fetch(url, {
          method,
          headers: {
            "x-telegram-id": localStorage.getItem("telegramId") || "",
            "x-user-id": localStorage.getItem("userId") || "",
            ...(method === "POST"
              ? { "Content-Type": "application/json" }
              : {}),
          },
        });
        const json = await res.json();
        setData(json);
        setLastUpdate(new Date());
      } finally {
        setLoading(false);
        setTimeout(() => setIsUpdating(false), 500);
      }
    };

    fetchData();
    const i = setInterval(fetchData, 60000);
    return () => clearInterval(i);
  }, [params?.since, params?.until]);

  return { data, loading, lastUpdate, isUpdating };
}
