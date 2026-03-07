import { useQuery } from "@tanstack/react-query";
import { client } from "../helpers/api";

type ShopFilter = {
  shopName?: string;
  shopUuid?: string;
};

export function useAnalyticsShops() {
  return useQuery({
    queryKey: ["analytics", "shops"],
    queryFn: async () => {
      const res = await client.api.stores.shops.$get();
      if (!res.ok) throw new Error("Не удалось загрузить список магазинов");
      const json = (await res.json()) as {
        shopsNameAndUuid?: Array<{ name: string; uuid: string }>;
      };
      return Array.isArray(json.shopsNameAndUuid) ? json.shopsNameAndUuid : [];
    },
    staleTime: 5 * 60_000,
  });
}

export function useProductDashboard() {
  return useQuery({
    queryKey: ["analytics", "product"],
    queryFn: async () => {
      const res = await (client.api.analytics.dashboards.product as any).$get();
      if (!res.ok) throw new Error("Не удалось загрузить Product dashboard");
      return res.json();
    },
    refetchInterval: 60_000,
  });
}

export function useReliabilityDashboard() {
  return useQuery({
    queryKey: ["analytics", "reliability"],
    queryFn: async () => {
      const res = await (client.api.analytics.dashboards.reliability as any).$get();
      if (!res.ok) throw new Error("Не удалось загрузить Reliability dashboard");
      return res.json();
    },
    refetchInterval: 60_000,
  });
}

export function useBusinessDashboard(filter?: ShopFilter) {
  return useQuery({
    queryKey: ["analytics", "business", filter?.shopUuid || "", filter?.shopName || ""],
    queryFn: async () => {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const date = `${yyyy}-${mm}-${dd}`;
      const res = await (client.api.analytics.dashboards.business as any).$get({
        query: {
          since: date,
          until: date,
          shopUuid: filter?.shopUuid || undefined,
          shopName: filter?.shopName || undefined,
        },
      });
      if (!res.ok) throw new Error("Не удалось загрузить Business dashboard");
      return res.json();
    },
		refetchInterval: 60_000,
	});
}
