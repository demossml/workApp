import { useQuery } from "@tanstack/react-query";
import { client } from "../helpers/api";

interface IsOpenStoreResponse {
  exists: boolean;
  error?: string;
}

export const useIsOpenStore = (userId: string, date: string) =>
  useQuery<IsOpenStoreResponse>({
    queryKey: ["isOpenStore", userId, date],
    queryFn: async () => {
      const res = await client.api.stores["is-open-store"].$post({
        json: { userId, date },
      });

      if (!res.ok) {
        throw new Error("Ошибка при проверке открытия магазина");
      }

      return res.json();
    },
    enabled: !!userId && !!date, // запрос выполняется только если есть userId и date
  });
