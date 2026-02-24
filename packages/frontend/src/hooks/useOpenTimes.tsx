import { client } from "../helpers/api";
import { useQuery } from "@tanstack/react-query";

export const useOpenTimes = () =>
  useQuery<Record<string, string>, Error>({
    queryKey: ["getOpenTimes"],
    queryFn: async () => {
      const res = await client.api.schedules.schedule.$get();
      if (!res.ok) {
        throw new Error("Ошибка загрузки времени открытия магазинов");
      }
      const data = await res.json();
      return data.dataReport || {};
    },
    select: (data) => data || {}, // возвращаем объект, а не массив
  });
