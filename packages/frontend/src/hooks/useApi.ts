import { useQuery } from "@tanstack/react-query";
import { client } from "../helpers/api";

export const useMe = () =>
  useQuery({
    queryKey: ["currentUser"],
    queryFn: () => client.api.user.$get().then((res) => res.json()),
  });

export const useEmployeeRole = () =>
  useQuery({
    queryKey: ["currentEmployee"],
    queryFn: () => client.api["employee-role"].$get().then((res) => res.json()),
  });

export const useEmployeeNameAndUuid = () =>
  useQuery({
    queryKey: ["currentEmployeeUuidName"],
    queryFn: () =>
      client.api["by-last-name-uuid"].$get().then((res) => res.json()),
  });

export const useSchedules = () =>
  useQuery({
    queryKey: ["schedules"],
    queryFn: () => client.api.schedules.$get().then((res) => res.json()),
  });

type ShopBrief = { uuid: string; name: string };

export const useGetShops = () =>
  useQuery<{ shopsNameAndUuid: ShopBrief[] }, Error>({
    queryKey: ["getShops"],
    queryFn: async () => {
      const res = await client.api.shops.$get();
      const data = await res.json();
      return data as { shopsNameAndUuid: ShopBrief[] };
    },
  });

// export const useGetShopNames = () =>
//   useQuery<string[], Error>({
//     queryKey: ["getShopNames"],
//     queryFn: async () => {
//       const res = await client.api.evotor["shops-names"].$get();
//       if (!res.ok) {
//         throw new Error("Ошибка загрузки названий магазинов");
//       }
//       const data = await res.json();
//       return data.shopsName || [];
//     },
//     select: (data) => data || [], // на всякий случай
//   });
