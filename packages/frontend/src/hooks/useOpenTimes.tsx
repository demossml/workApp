import { client } from "../helpers/api";
import { useQuery } from "@tanstack/react-query";
import { OpenTimesResponseSchema } from "@work-appt/backend/src/contracts/openTimes";

export const useOpenTimes = () =>
  useQuery<Record<string, string>, Error>({
    queryKey: ["getOpenTimes"],
    queryFn: async () => {
      const res = await client.api.schedules.schedule.$get();
      if (!res.ok) {
        throw new Error("Ошибка загрузки времени открытия магазинов");
      }
      const raw = await res.json();
      const parsed = OpenTimesResponseSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error("Некорректный формат времени открытия магазинов");
      }
      return parsed.data.dataReport || {};
    },
    select: (data) => data || {}, // возвращаем объект, а не массив
  });
