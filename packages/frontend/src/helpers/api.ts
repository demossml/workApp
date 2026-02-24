import { hc } from "hono/client";
import type { IAPI } from "@work-appt/backend";
import { telegram } from "./telegram";

console.log("telegram.WebApp.initData:", telegram.WebApp.initData);

let initData = telegram.WebApp.initData || "";

if (!initData) {
  const storedId = localStorage.getItem("telegramId");
  if (storedId) {
    initData = "guest"; // чтобы пройти auth
  }
}
export const client = hc<IAPI>("", {
  init: {
    headers: {
      initData: telegram.WebApp.initData || "guest",
      "telegram-id": localStorage.getItem("telegramId") || "",
    },
  },
});
