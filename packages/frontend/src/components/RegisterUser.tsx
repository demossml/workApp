import { useState } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";

interface RegisterUserProps {
  onRegister: (id: string) => void;
}

export function RegisterUser({ onRegister }: RegisterUserProps) {
  const [telegramId, setTelegramId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!telegramId.trim()) {
      setError("Пожалуйста, введите ваш Telegram ID");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch("/api/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: telegramId }),
      });

      const data = await response.json();

      if (data.success) {
        localStorage.setItem("telegramId", telegramId);
        onRegister(telegramId);
        window.location.href = "/";
      } else {
        setError(data.message || "Ошибка при регистрации");
      }
    } catch (err) {
      console.error("Ошибка при регистрации:", err);
      setError("Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md shadow-lg dark:bg-gray-800 text-black dark:text-gray-200">
      <CardHeader>
        <CardTitle className="text-center text-lg font-semibold">
          Регистрация нового пользователя
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="text"
            placeholder="Введите Telegram ID"
            value={telegramId}
            onChange={(e) => setTelegramId(e.target.value)}
            disabled={loading}
          />

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <Button
            type="submit"
            className="w-full"
            disabled={!telegramId.trim() || loading}
          >
            {loading ? "Регистрация..." : "Зарегистрировать"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
