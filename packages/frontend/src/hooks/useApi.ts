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

export const useGetShops = () =>
  useQuery({
    queryKey: ["getShops"],
    queryFn: () => client.api.shops.$get().then((res) => res.json()),
  });
