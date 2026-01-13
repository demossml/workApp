import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import ProgressSteps from "../../components/opening/ProgressSteps";
import InitialStep from "../../components/opening/InitialStep";
import PhotoStep from "../../components/opening/PhotoStep";
import CashCheckStep from "../../components/opening/CashCheckStep";
import type { StoreOpeningStep } from "./types";
import { useUser } from "../../hooks/userProvider";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";
import { isTelegramMiniApp, telegram } from "../../helpers/telegram";
import { loadProgress, saveProgress } from "../../helpers/openingProgress";

export default function StoreOpeningPage() {
  const [currentStep, setCurrentStep] = useState<StoreOpeningStep>("initial");
  const isMiniApp = isTelegramMiniApp();

  const tg = useUser();
  const userId = tg.id.toString();

  useTelegramBackButton();

  // загрузка сохранённого шага
  useEffect(() => {
    const saved = loadProgress();
    const today = new Date().toISOString().slice(0, 10);

    if (saved && saved.date === today) {
      setCurrentStep(saved.step as StoreOpeningStep);
    } else {
      setCurrentStep("initial");
    }
  }, []);

  // сохранение шага при изменении
  useEffect(() => {
    saveProgress(currentStep);
  }, [currentStep]);

  useEffect(() => {
    if (!isMiniApp) return;
    telegram.WebApp.MainButton.hide();
    telegram.WebApp.setBackgroundColor("#f9fafb");
  }, [isMiniApp]);

  return (
    <motion.div
      className="min-h-screen w-full px-5 py-8 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        minHeight: "calc(100vh - 130px)",
        paddingTop: "calc(env(safe-area-inset-top) + 70px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)",
      }}
    >
      <div className="max-w-xl mx-auto space-y-6">
        {/* 👇 Просто передаём текущий шаг */}
        <ProgressSteps current={currentStep} />

        {currentStep === "initial" && (
          <InitialStep setCurrentStep={setCurrentStep} userId={userId} />
        )}

        {currentStep === "photos" && (
          <PhotoStep setCurrentStep={setCurrentStep} userId={userId} />
        )}

        {currentStep === "cash_check" && (
          <CashCheckStep setCurrentStep={setCurrentStep} userId={userId} />
        )}
      </div>
    </motion.div>
  );
}
