// Salary widget for Home dashboard — shows month bonus + today's plan status
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { HandCoins, TrendingUp, TrendingDown } from "lucide-react";
import { client } from "../../helpers/api";

interface ShopPlan {
  shop: string;
  vape: number;
  plan: number;
  met: boolean;
  bonus: number;
}

interface DashboardSalary {
  monthBonus: number;
  monthOklad: number;
  todayPlans: ShopPlan[];
}

export function SalaryWidget() {
  const [data, setData] = useState<DashboardSalary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const response = await client.api.evotor.dashboards.salary.$get();
        if (response.ok) {
          const json = await response.json() as DashboardSalary;
          setData(json);
        }
      } catch (err) {
        console.error("SalaryWidget error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  if (loading) return null;
  if (!data) return null;

  const totalPlans = data.todayPlans.length;
  const metPlans = data.todayPlans.filter(p => p.met).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full mt-3 mb-3"
    >
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <HandCoins className="w-5 h-5 text-amber-500" />
          <h3 className="font-semibold text-slate-800 dark:text-slate-200">Зарплата</h3>
        </div>

        {/* Month total */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3">
            <div className="text-xs text-amber-600 dark:text-amber-400">Бонус за месяц</div>
            <div className="text-xl font-bold text-amber-700 dark:text-amber-300">{data.monthBonus.toLocaleString()} ₽</div>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3">
            <div className="text-xs text-blue-600 dark:text-blue-400">Оклад</div>
            <div className="text-xl font-bold text-blue-700 dark:text-blue-300">{data.monthOklad.toLocaleString()} ₽</div>
          </div>
        </div>

        {/* Today's plan status */}
        {data.todayPlans.length > 0 && (
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-2">
              План по вейпам сегодня
              <span className={`text-xs px-2 py-0.5 rounded-full ${metPlans === totalPlans ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                {metPlans}/{totalPlans}
              </span>
            </div>
            {data.todayPlans.map((p, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                <span className="text-sm text-slate-700 dark:text-slate-300">{p.shop}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">{p.vape.toLocaleString()} / {p.plan.toLocaleString()}</span>
                  {p.met ? (
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
