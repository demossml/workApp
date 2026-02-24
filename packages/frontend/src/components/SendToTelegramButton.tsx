// SendToTelegramButton.tsx
import type React from "react";
import { client } from "../helpers/api";

interface SendToTelegramButtonProps {
  html: string; // Тип для html пропса
}

const SendToTelegramButton: React.FC<SendToTelegramButtonProps> = ({
  html,
}) => {
  const sendToTelegram = async () => {
    alert(`Отправляем HTML: ${html}`);

    if (!html?.trim()) {
      alert("Нет данных для отправки");
      return;
    }

    const response = await client.api.evotor["generate-pdf"].$post({
      json: { html },
    });

    if (response.ok) {
      alert("Отчет отправлен в Telegram!");
    } else {
      alert("Ошибка отправки.");
    }
  };

  return (
    <button
      onClick={sendToTelegram}
      className="text-blue-500  dark:text-blue-400 text-sm font-semibold flex items-center"
    >
      <span className="mr-2">←</span> Отпарить в Telegram
    </button>
  );
};

export default SendToTelegramButton;
