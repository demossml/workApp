import { hc } from "hono/client";
import type { IAPI } from "@evo-app/backend";
import { telegram } from "./telegram";

console.log("telegram.WebApp.initData:", telegram.WebApp.initData);

if (!telegram.WebApp.initData) {
  console.error("Telegram WebApp initData отсутствует.");
}

export const client = hc<IAPI>("", {
  init: {
    headers: {
      initData: telegram.WebApp.initData || "guest",
    },
  },
});
