import { useQuery } from "@tanstack/react-query";
import { client } from "../helpers/api";

// Тип ответа от API
type CurrentWorkShopResponse = {
  uuid: string;
  name: string;
  isWorkingToday: boolean;
};

/**
 * Хук для получения информации о магазине, в котором сотрудник работает сегодня.
 * API берет Telegram user ID и сравнивает с фамилией сотрудника, открывшего смену,
 * затем возвращает UUID и name магазина.
 */
export const useCurrentWorkShop = () =>
  useQuery<CurrentWorkShopResponse, Error>({
    queryKey: ["currentWorkShop"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (client.api.evotor as any)["current-work-shop"].$get();

      if (!res.ok) {
        throw new Error("Ошибка загрузки данных о текущем магазине");
      }

      const data = await res.json();
      return data;
    },
    retry: 2,
    staleTime: 5 * 60 * 1000, // данные считаются свежими 5 минут
    refetchOnWindowFocus: true,
  });
