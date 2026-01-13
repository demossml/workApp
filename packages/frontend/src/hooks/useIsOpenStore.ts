import { useQuery } from "@tanstack/react-query";

interface IsOpenStoreResponse {
  exists: boolean;
  error?: string;
}

export const useIsOpenStore = (userId: string, date: string) =>
  useQuery<IsOpenStoreResponse>({
    queryKey: ["isOpenStore", userId, date],
    queryFn: async () => {
      const res = await fetch("/api/is-open-store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, date }),
      });

      if (!res.ok) {
        throw new Error("Ошибка при проверке открытия магазина");
      }

      return res.json();
    },
    enabled: !!userId && !!date, // запрос выполняется только если есть userId и date
  });
