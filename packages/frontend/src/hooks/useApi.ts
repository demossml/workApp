import { useQuery } from "@tanstack/react-query";
import { client } from "../helpers/api";
import { WorkingByShopsResponseSchema } from "@work-appt/backend/src/contracts/workingByShops";

export const useMe = () =>
  useQuery({
    queryKey: ["currentUser"],
    queryFn: () =>
      client.api.employees.user.$get().then((res: Response) => res.json()),
  });

export const useEmployeeRole = () =>
  useQuery({
    queryKey: ["currentEmployee"],
    queryFn: () =>
      client.api.employees["employee-role"]
        .$get()
        .then((res: Response) => res.json()),
  });

export const useEmployeeNameAndUuid = () =>
  useQuery({
    queryKey: ["currentEmployeeUuidName"],
    queryFn: () =>
      client.api.employees["by-last-name-uuid"]
        .$get()
        .then((res: Response) => res.json()),
  });

export const useSchedules = () =>
  useQuery({
    queryKey: ["schedules"],
    queryFn: () =>
      client.api.schedules.schedule.$get().then((res: Response) => res.json()),
  });

export const useWorkingByShops = () =>
  useQuery({
    queryKey: ["workingByShops"],
    queryFn: async () => {
      const res = await (client.api.evotor as any)["working-by-shops"].$get();
      if (!res.ok) {
        throw new Error("Ошибка загрузки данных по сменам");
      }
      const raw = await res.json();
      const parsed = WorkingByShopsResponseSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error("Некорректный формат данных по сменам");
      }
      return parsed.data;
    },
    refetchInterval: 60_000,
  });

type ShopBrief = { uuid: string; name: string };

export const useGetShops = () =>
  useQuery<{ shopsNameAndUuid: ShopBrief[] }, Error>({
    queryKey: ["getShops"],
    queryFn: async () => {
      const res = await client.api.stores.shops.$get();
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
