import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Button } from "../../components/ui/button";
import type { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger, Calendar } from "../../components/ui";
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
  const formatLocalDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getLastWeekRange = () => {
    const today = new Date();
    const day = today.getDay(); // 0 - Sunday, 1 - Monday, ... 6 - Saturday
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const thisWeekMonday = new Date(today);
    thisWeekMonday.setDate(today.getDate() + mondayOffset);

    const start = new Date(thisWeekMonday);
    start.setDate(thisWeekMonday.getDate() - 7); // Monday of previous week

    const end = new Date(start);
    end.setDate(start.getDate() + 6); // Sunday of previous week

    return {
      startDate: formatLocalDate(start),
      endDate: formatLocalDate(end),
    };
  };

  const initialRange = getLastWeekRange();
  const [startDate, setStartDate] = useState<string>(initialRange.startDate);
  const [endDate, setEndDate] = useState<string>(initialRange.endDate);
  const [dateMode, setDateMode] = useState<"lastWeek" | "period">("lastWeek");
  const [period, setPeriod] = useState<DateRange | undefined>(undefined);
  const [tempPeriod, setTempPeriod] = useState<DateRange | undefined>(undefined);
  const [showPeriodPicker, setShowPeriodPicker] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [responseData, setResponseData] = useState<ResponseData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useTelegramBackButton();

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  useEffect(() => {
    if (dateMode === "lastWeek") {
      const lastWeek = getLastWeekRange();
      setStartDate(lastWeek.startDate);
      setEndDate(lastWeek.endDate);
      setPeriod(undefined);
      setTempPeriod(undefined);
      setShowPeriodPicker(false);
    }
  }, [dateMode]);

  useEffect(() => {
    if (dateMode !== "period" || !period?.from || !period?.to) return;
    setStartDate(formatLocalDate(period.from));
    setEndDate(formatLocalDate(period.to));
  }, [dateMode, period]);

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
      className="app-page w-full px-4 sm:px-6 py-6 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col items-center"
      style={{
        paddingTop: "calc(var(--app-top-clearance) + 0.5rem)",
        paddingBottom: "calc(var(--app-bottom-clearance) + 0.5rem)",
      }}
    >
      <h2 className="text-xl sm:text-2xl font-semibold text-center mb-2">
        Отчет по зарплате
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 text-center">
        Выберите период и получите детализацию начислений
      </p>

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
          <div className="w-full max-w-3xl space-y-4">
            {/* Результаты по дням */}
            <div>
              <Card className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm">
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
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm mt-2"
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
                <Card className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm mt-2">
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
          className="w-full max-w-3xl space-y-4 bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm"
        >
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                dateMode === "lastWeek"
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-300 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              }`}
              onClick={() => setDateMode("lastWeek")}
            >
              Прошлая неделя
            </button>
            <Popover
              open={showPeriodPicker}
              onOpenChange={(open) => {
                setShowPeriodPicker(open);
                if (!open) setTempPeriod(undefined);
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={`rounded-lg border px-3 py-2 text-sm transition ${
                    dateMode === "period"
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-300 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  }`}
                  onClick={() => {
                    setDateMode("period");
                    setTempPeriod(period);
                    setShowPeriodPicker(true);
                  }}
                >
                  Период
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <Calendar
                  mode="range"
                  selected={tempPeriod?.from ? tempPeriod : undefined}
                  onSelect={setTempPeriod}
                  numberOfMonths={1}
                  disabled={(date) => date > new Date()}
                  initialFocus
                />
                <div className="flex justify-end p-2">
                  <button
                    className="px-3 py-1 rounded bg-blue-600 text-white"
                    disabled={!(tempPeriod?.from && tempPeriod?.to)}
                    onClick={() => {
                      setPeriod(tempPeriod);
                      setShowPeriodPicker(false);
                    }}
                  >
                    Применить
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          {dateMode === "period" && period?.from && period?.to && (
            <div className="text-sm text-slate-600 dark:text-slate-300">
              {formatDate(period.from)} → {formatDate(period.to)}
            </div>
          )}

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
            className="w-full mt-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white border-0 shadow-sm transition-colors duration-200"
          >
            Получить отчет
          </Button>
        </motion.form>
      )}
    </motion.div>
  );
}
