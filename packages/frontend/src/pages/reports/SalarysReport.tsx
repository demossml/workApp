import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Button } from "../../components/ui/button";
import { SaveAsJpegButton } from "../../components/SaveAsJpegButton";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";
import { client } from "../../helpers/api";

interface EmployeeOptions {
  uuid: string;
  name: string;
}

interface TotalReport {
  employeeName: string | null;
  startDate: string;
  endDate: string;
  totalBonusAccessories: number;
  totalBonusPlan: number;
  totalBonus: number;
}

interface ResponseData {
  status?: string;
  message?: string;
  result?: Array<{
    date: string;
    shopName: string;
    bonusAccessories: number;
    dataPlan: number;
    salesDataVape: number;
    bonusPlan: number;
    totalBonus: number;
  }>;
  totalReport?: TotalReport;
}

export default function SalaryReports() {
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOptions[]>([]);
  const [startDate, setStartDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [responseData, setResponseData] = useState<ResponseData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useTelegramBackButton();

  const calculateDate = (date: string, days: number): string => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result.toISOString().split("T")[0];
  };

  useEffect(() => {
    const fetchEmployeesData = async () => {
      try {
        const response = await client.api.employees.nameUuid.$get();

        if (!response.ok) throw new Error(`Ошибка: ${response.status}`);
        const data = await response.json();

        if (data.employeeNameAndUuid) {
          setEmployeeOptions(data.employeeNameAndUuid);
        } else {
          setError("Список сотрудников не найден в ответе");
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Неизвестная ошибка";
        console.error("Ошибка при загрузке:", errorMessage);
        setError("Не удалось загрузить данные сотрудников");
      }
    };
    fetchEmployeesData();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedEmployee) {
      setError("Пожалуйста, выберите сотрудника");
      return;
    }

    setLoading(true);
    setError(null);
    setResponseData(null);

    try {
      const response = await client.api.evotor.salary.$post({
        json: {
          employee: selectedEmployee,
          startDate,
          endDate,
        },
      });

      if (response.ok) {
        const result: ResponseData = await response.json();
        setResponseData(result);
      } else {
        const err = (await response.json().catch(() => null)) as
          | Record<string, unknown>
          | null;
        setError(
          (typeof err?.error === "string" ? err.error : undefined) ||
            (typeof err?.message === "string" ? err.message : undefined) ||
            "Не удалось отправить данные"
        );
      }
    } catch {
      setError("Не удалось отправить данные");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="w-screen mt-8 min-h-screen px-4 py-6 bg-custom-gray dark:bg-gray-900 text-gray-800  dark:text-gray-300
      "
    >
      <h2 className="text-2xl font-bold text-center mb-6 text-gray-900 dark:text-white">
        Отчет по зарплате
      </h2>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="text-red-500 dark:text-red-400 text-center mb-4"
        >
          {error}
        </motion.div>
      )}

      {loading ? (
        <div className="flex justify-center items-center min-h-[60vh]">
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="w-24 h-24 border-8 border-t-transparent border-blue-500 dark:border-blue-400 rounded-full animate-spin"
          />
        </div>
      ) : responseData ? (
        <SaveAsJpegButton fileName="salary-report.jpeg">
          <div className="space-y-6">
            {/* Результаты по дням */}
            <div>
              <Card className="bg-custom-gray dark:bg-gray-800">
                <CardHeader>
                  <CardTitle className="dark:text-white">Период</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 dark:text-gray-300">
                  <p>
                    Начало периода:{" "}
                    {responseData.totalReport?.startDate || startDate}
                  </p>
                  <p>
                    Конец периода:{" "}
                    {responseData.totalReport?.endDate || endDate}
                  </p>
                </CardContent>
              </Card>

              {responseData.result?.map((item) => (
                <Card
                  key={`${item.date}-${item.shopName}`}
                  className="bg-custom-gray dark:bg-gray-800 shadow-md mt-2"
                >
                  <CardContent className="space-y-1 dark:text-gray-300">
                    <div className="flex justify-between">
                      <span>Дата:</span>
                      <span className="font-bold">{item.date}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Имя магазина:</span>
                      <span className="font-bold">{item.shopName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Бонус за аксессуары:</span>
                      <span className="font-bold">
                        {item.bonusAccessories} ₽
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>План Vape:</span>
                      <span className="font-bold">{item.dataPlan} ₽</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Продажи Vape:</span>
                      <span className="font-bold">{item.salesDataVape} ₽</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Бонус за продажу Vape:</span>
                      <span className="font-bold">{item.bonusPlan} ₽</span>
                    </div>
                    <div className="mt-2 flex justify-between font-bold">
                      <span>Итоговый бонус:</span>
                      <span className="bg-blue-500 dark:bg-blue-600 text-white rounded px-3 py-1 text-xs font-semibold">
                        {item.totalBonus} ₽
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {responseData.totalReport && (
                <Card className="bg-custom-gray dark:bg-gray-800 shadow-md mt-2">
                  <CardHeader>
                    <CardTitle className="dark:text-white">
                      Общий отчет
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 dark:text-gray-300">
                    <div className="flex justify-between">
                      <span>Имя сотрудника:</span>
                      <span className="font-bold">
                        {responseData.totalReport.employeeName || "Не указано"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Итого по аксессуарам:</span>
                      <span className="font-bold">
                        {responseData.totalReport.totalBonusAccessories} ₽
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Итого бонус по план Vape:</span>
                      <span className="font-bold">
                        {responseData.totalReport.totalBonusPlan} ₽
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Итого бонус:</span>
                      <span className="font-bold">
                        {responseData.totalReport.totalBonus} ₽
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </SaveAsJpegButton>
      ) : (
        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="space-y-4 bg-custom-gray dark:bg-gray-800 p-4 rounded-lg shadow-md"
        >
          <div>
            <Label htmlFor="start-date" className="dark:text-gray-300">
              Начало периода:
            </Label>
            <Input
              type="date"
              id="start-date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (
                  new Date(endDate) > new Date(calculateDate(e.target.value, 7))
                ) {
                  setEndDate(calculateDate(e.target.value, 7));
                }
                if (new Date(endDate) < new Date(e.target.value)) {
                  setEndDate(e.target.value);
                }
              }}
            />
          </div>

          <div>
            <Label htmlFor="end-date" className="dark:text-gray-300">
              Конец периода:
            </Label>
            <Input
              type="date"
              id="end-date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate}
              max={calculateDate(startDate, 7)}
            />
          </div>

          <div>
            <Label htmlFor="employee" className="dark:text-gray-300">
              Выберите сотрудника:
            </Label>
            <Select
              onValueChange={(value) => setSelectedEmployee(value)}
              value={selectedEmployee || ""}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Выберите сотрудника" />
              </SelectTrigger>
              <SelectContent>
                {employeeOptions.map((option) => (
                  <SelectItem key={option.uuid} value={option.uuid}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="submit"
            className="w-full mt-2 bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white border-0 shadow-md transition-colors duration-200"
          >
            Получить отчет
          </Button>
        </motion.form>
      )}
    </motion.div>
  );
}
