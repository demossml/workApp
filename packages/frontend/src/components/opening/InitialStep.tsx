import { motion } from "framer-motion";
import type { StoreOpeningStep } from "../../pages/opening/types";
import { useIsOpenStore } from "../../hooks/useIsOpenStore";
import { useMemo } from "react";

interface InitialStepProps {
  setCurrentStep: React.Dispatch<React.SetStateAction<StoreOpeningStep>>;
  userId: string;
}

export default function InitialStep({
  setCurrentStep,
  userId,
}: InitialStepProps) {
  // Формируем текущую дату в dd-mm-yyyy
  const today = useMemo(() => {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }, []);

  const { data, isLoading } = useIsOpenStore(userId, today);

  const handleStart = async () => {
    await fetch("/api/open-store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timestamp: new Date().toISOString(), userId }),
    });

    setCurrentStep("photos"); // Переходим к следующему шагу
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Утреннее открытие магазина</h1>

      {isLoading ? (
        <div className="text-gray-500">Загрузка данных…</div>
      ) : data?.exists ? (
        <div className="text-green-600 font-medium">
          Вы уже открыли магазин сегодня
        </div>
      ) : (
        <motion.button
          onClick={handleStart}
          className="w-full py-3 bg-blue-600 text-white rounded-xl shadow hover:bg-blue-700"
          whileTap={{ scale: 0.97 }}
        >
          Открыть магазин
        </motion.button>
      )}
    </div>
  );
}
