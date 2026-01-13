import { client } from "../helpers/api";
import { useQuery } from "@tanstack/react-query";

export const useGetShopNames = () =>
  useQuery<string[], Error>({
    queryKey: ["getShopNames"],
    queryFn: async () => {
      const res = await client.api.evotor["shops-names"].$get();
      if (!res.ok) {
        throw new Error("Ошибка загрузки названий магазинов");
      }
      const data = await res.json();
      return data.shopsName || [];
    },
    select: (data) => data || [], // на всякий случай
  });
