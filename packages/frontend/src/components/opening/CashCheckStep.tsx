// CashCheckStep.tsx
import { useState, useEffect } from "react";
import CashDiscrepancyForm from "./CashDiscrepancyForm";
import type {
  StoreOpeningStep,
  CashDiscrepancyData,
} from "../../pages/opening/types";

interface CashCheckStepProps {
  setCurrentStep: React.Dispatch<React.SetStateAction<StoreOpeningStep>>;
  userId: string;
}

export default function CashCheckStep({
  setCurrentStep,
  userId,
}: CashCheckStepProps) {
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [discrepancy, setDiscrepancy] = useState<CashDiscrepancyData>({
    amount: "",
    type: "+",
  });

  // Автоматическая прокрутка вверх при монтировании компонента
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const finish = async () => {
    await fetch("/api/finish-opening", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: isCorrect,
        discrepancy: isCorrect ? null : discrepancy,
        userId,
      }),
    });

    setCurrentStep("initial");
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Проверка кассы</h2>

      <div className="space-y-2">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="cash"
            checked={isCorrect === true}
            onChange={() => setIsCorrect(true)}
          />
          Касса сходится
        </label>

        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="cash"
            checked={isCorrect === false}
            onChange={() => setIsCorrect(false)}
          />
          Касса не сходится
        </label>
      </div>

      {isCorrect === false && (
        <CashDiscrepancyForm data={discrepancy} setData={setDiscrepancy} />
      )}

      <button
        className="w-full py-3 bg-blue-600 text-white rounded-xl shadow"
        onClick={finish}
        disabled={isCorrect === null}
      >
        Завершить открытие
      </button>
    </div>
  );
}
