import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { client } from "@/helpers/api";
import { useEmployeeNameAndUuid } from "@/hooks/useApi";

/** Дни текущей недели (пн-вс) */
function getCurrentWeekRange(): { since: string; until: string; label: string } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const monday = new Date(now);
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  monday.setDate(now.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const fmtShort = (d: Date) =>
    d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

  return {
    since: fmt(monday),
    until: fmt(sunday),
    label: `${fmtShort(monday)} – ${fmtShort(sunday)}`,
  };
}

interface WeekSalaryData {
  totalPayout: number;
  workingDays: number;
  okladDaily: number;
  totalBonus: number;
  days: { date: string; bonus: number }[];
}

async function fetchWeekSalary(
  employeeUuid: string
): Promise<WeekSalaryData> {
  const { since, until } = getCurrentWeekRange();
  const res = await client.api.evotor.salary.$post({
    json: { employeeUuid, since, until },
  });
  const data: any = await res.json();
  return {
    totalPayout: data.totalPayout ?? 0,
    workingDays: data.workingDays ?? 0,
    okladDaily: data.okladDaily ?? 0,
    totalBonus: data.bonusTotal ?? data.totalBonus ?? 0,
    days: data.days ?? [],
  };
}

export function WeekSalary() {
  const { data: emp } = useEmployeeNameAndUuid();
  const uuid = emp?.employeeNameAndUuid?.[0]?.uuid;

  const { label } = getCurrentWeekRange();

  const { data, isLoading } = useQuery({
    queryKey: ["week-salary", uuid],
    queryFn: () => fetchWeekSalary(uuid!),
    enabled: !!uuid,
    staleTime: 5 * 60_000,
    refetchInterval: 30 * 60_000,
  });

  if (!uuid) return null;

  if (isLoading || !data) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 animate-pulse">
        <div className="h-3 w-28 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
        <div className="h-6 w-20 bg-gray-100 dark:bg-gray-750 rounded" />
      </div>
    );
  }

  const daysWorked = data.days?.filter((d: any) => d.bonus !== undefined).length ?? 0;
  const totalDays = Math.min(6, data.workingDays || daysWorked); // пн-сб, макс 6

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4"
    >
      <div className="text-[10px] text-gray-500 dark:text-gray-400 mb-1">
        💰 Неделя {label}
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-xl font-bold text-gray-800 dark:text-gray-100">
          {data.totalPayout.toLocaleString("ru-RU")} ₽
        </span>
        <span className="text-[10px] text-gray-400">
          оклад + бонус
        </span>
      </div>

      {/* Day dots */}
      {totalDays > 0 && (
        <div className="flex gap-1">
          {Array.from({ length: totalDays }).map((_, i) => {
            const dayData = data.days?.[i];
            const hasBonus = dayData?.bonus > 0;
            const hasWorked = dayData !== undefined;
            return (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full ${
                  hasBonus
                    ? "bg-emerald-500"
                    : hasWorked
                    ? "bg-amber-300 dark:bg-amber-600"
                    : "bg-gray-200 dark:bg-gray-700"
                }`}
              />
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
