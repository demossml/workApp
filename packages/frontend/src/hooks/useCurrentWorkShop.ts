import { useQuery } from "@tanstack/react-query";
import { client } from "../helpers/api";
import {
  CurrentWorkShopResponseSchema,
  type CurrentWorkShopResponse,
} from "@work-appt/backend/src/contracts/currentWorkShop";

// Тип ответа от API
/**
 * Хук для получения информации о магазине, в котором сотрудник работает сегодня.
 * API берет Telegram user ID и сравнивает с фамилией сотрудника, открывшего смену,
 * затем возвращает UUID и name магазина.
 */
export const useCurrentWorkShop = () =>
  useQuery<CurrentWorkShopResponse, Error>({
    queryKey: ["currentWorkShop"],
    queryFn: async () => {
      const res = await client.api.evotor["current-work-shop"].$get();

      if (!res.ok) {
        throw new Error("Ошибка загрузки данных о текущем магазине");
      }

      const raw = await res.json();
      const parsed = CurrentWorkShopResponseSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error("Некорректный формат данных текущего магазина");
      }
      return parsed.data;
    },
    retry: 2,
    staleTime: 5 * 60 * 1000, // данные считаются свежими 5 минут
    refetchOnWindowFocus: true,
  });
