import { useQuery } from "@tanstack/react-query";
import { client } from "../helpers/api";

interface IsOpenStoreResponse {
  exists: boolean;
  error?: string;
}

export const useIsOpenStore = (
  userId: string,
  date: string,
  shopUuid: string | null,
) =>
  useQuery<IsOpenStoreResponse>({
    queryKey: ["isOpenStore", userId, date, shopUuid],
    queryFn: async () => {
      const res = await client.api.stores["is-open-store"].$post({
        json: { userId, date, shopUuid: shopUuid ?? "" },
      });

      if (!res.ok) {
        return { exists: false, error: "temporary_unavailable" };
      }

      return res.json();
    },
    enabled: !!userId && !!date && !!shopUuid,
  });
