import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

export function PWAInstall() {
  const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW();

  useEffect(() => {
    if (offlineReady) {
      console.log("✅ Приложение готово к офлайн-работе");
    }
    if (needRefresh) {
      console.log("♻️ Доступна новая версия, обновляем…");
      updateServiceWorker();
    }
  }, [offlineReady, needRefresh, updateServiceWorker]);

  return null;
}
