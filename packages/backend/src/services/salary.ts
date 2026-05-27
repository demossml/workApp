// Salary calculation service — unified logic for bonus computation
import type { D1Adapter } from "../db-duckdb";
import type { DuckDBDataService } from "../data-service";
import { logger } from "../logger";
import { getProductsByGroup } from "../db/repositories/products";
import { createD1Adapter } from "../db-duckdb";

export interface SalaryConfig {
  oklad_monthly: number;
  bonus_plan_daily: number;
  bonus_accessories_pct: number;
}

export interface DailySalary {
  date: string;
  shopUuid: string;
  shopName: string;
  employeeUuid: string;
  employeeName: string;
  accessoriesSales: number;
  vapeSales: number;
  planValue: number;
  bonusPlan: number;
  bonusAccessories: number;
  totalBonus: number;
  okladDaily: number;
}

export interface SalaryReport {
  employeeName: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  totalOklad: number;
  totalBonusAccessories: number;
  totalBonusPlan: number;
  totalBonus: number;
  totalPayout: number;
  details: DailySalary[];
}

/** Read salary config from DB. Falls back to defaults. */
export async function getSalaryConfig(db: D1Adapter): Promise<SalaryConfig> {
  try {
    const row = await db.prepare(
      "SELECT oklad_monthly, bonus_plan_daily, bonus_accessories_pct FROM salary_config LIMIT 1"
    ).first<SalaryConfig>();
    if (row) {
      return {
        oklad_monthly: Number(row.oklad_monthly) || 0,
        bonus_plan_daily: Number(row.bonus_plan_daily) || 450,
        bonus_accessories_pct: Number(row.bonus_accessories_pct) || 5,
      };
    }
  } catch (err) {
    logger.warn("salary_config read failed, using defaults", { error: String(err) });
  }
  return { oklad_monthly: 0, bonus_plan_daily: 450, bonus_accessories_pct: 5 };
}

/** Update salary config. */
export async function updateSalaryConfig(
  db: D1Adapter,
  config: Partial<SalaryConfig>
): Promise<void> {
  const existing = await db.prepare("SELECT COUNT(*) as c FROM salary_config").first<{ c: number }>();
  const c = existing?.c || 0;
  if (c === 0) {
    await db.prepare("INSERT INTO salary_config DEFAULT VALUES").run();
  }
  await db.prepare(`
    UPDATE salary_config SET 
      oklad_monthly = COALESCE(?, oklad_monthly),
      bonus_plan_daily = COALESCE(?, bonus_plan_daily),
      bonus_accessories_pct = COALESCE(?, bonus_accessories_pct),
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    config.oklad_monthly ?? null,
    config.bonus_plan_daily ?? null,
    config.bonus_accessories_pct ?? null,
  ).run();

  logger.info("salary_config updated", config);
}

/** Get daily plan for a shop. Uses recalculated flag instead of magic 5200 check. */
async function getDailyPlan(
  db: D1Adapter,
  shopUuid: string,
  date: string,
  evo: DuckDBDataService,
): Promise<number> {
  const month = date.slice(0, 7);

  // Try from plan table first
  const planRow = await db.prepare(
    "SELECT daily_plan, recalculated FROM plan WHERE shop_uuid = ? AND month = ?"
  ).bind(shopUuid, month).first<{ daily_plan: number; recalculated: boolean }>();

  if (planRow && planRow.recalculated) {
    return Number(planRow.daily_plan) || 0;
  }

  // Plan doesn't exist or not recalculated — regenerate
  const vapeGroupUuids = await getVapeGroupUuids(db);
  if (vapeGroupUuids.length === 0) return 0;

  const productUuids = await getProductsByGroup(db, shopUuid, vapeGroupUuids);
  const plan = await evo.getPlan(new Date(date));
  const value = plan?.[shopUuid] || 0;

  // Save recalculated plan
  await db.prepare(
    "INSERT OR REPLACE INTO plan (shop_uuid, month, daily_plan, recalculated) VALUES (?, ?, ?, TRUE)"
  ).bind(shopUuid, month, value).run();

  logger.info("Plan regenerated", { shopUuid: shopUuid.slice(-12), month, value });
  return value;
}

/** Get vape group UUIDs from DB (not hardcoded). */
async function getVapeGroupUuids(db: D1Adapter): Promise<string[]> {
  const rows = await db.prepare("SELECT group_uuid FROM vape_groups").all<{ group_uuid: string }>();
  return (rows.results || []).map(r => r.group_uuid);
}

/** Get accessory group UUIDs from DB. */
async function getAccessoryGroupUuids(db: D1Adapter): Promise<string[]> {
  const rows = await db.prepare("SELECT group_uuid FROM accessories").all<{ group_uuid: string }>();
  return (rows.results || []).map(r => r.group_uuid);
}

/** Calculate salary for one employee on one day at one shop. */
export async function calculateDaily(
  db: D1Adapter,
  evo: DuckDBDataService,
  date: string,        // YYYY-MM-DD
  shopUuid: string,
  employeeUuid: string,
  config?: SalaryConfig,
): Promise<DailySalary> {
  const cfg = config || await getSalaryConfig(db);

  const since = `${date}T00:00:00+03:00`;
  const until = `${date}T23:59:59+03:00`;
  const shopName = await evo.getShopName(shopUuid);
  const employeeName = await evo.getEmployeeByUuid(employeeUuid) || "";

  // Get plan
  const plan = await getDailyPlan(db, shopUuid, date, evo);

  // Get vape sales
  const vapeUuids = await getVapeGroupUuids(db);
  const vapeProducts = await getProductsByGroup(db, shopUuid, vapeUuids);
  const vapeSales = vapeProducts.length > 0
    ? await evo.getSalesSum(shopUuid, since, until, vapeProducts)
    : 0;

  // Get accessory sales
  const aksUuids = await getAccessoryGroupUuids(db);
  const aksProducts = await getProductsByGroup(db, shopUuid, aksUuids);
  const aksSales = aksProducts.length > 0
    ? await evo.getSalesSum(shopUuid, since, until, aksProducts)
    : 0;

  // Calculate bonuses from config
  const bonusAccessories = Math.floor(aksSales * cfg.bonus_accessories_pct / 100);
  const bonusPlan = vapeSales >= plan ? cfg.bonus_plan_daily : 0;
  const totalBonus = bonusAccessories + bonusPlan;

  // Daily oklad from monthly
  const daysInMonth = new Date(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)),
    0
  ).getDate();
  const okladDaily = Math.round(cfg.oklad_monthly / daysInMonth);

  const result: DailySalary = {
    date,
    shopUuid,
    shopName,
    employeeUuid,
    employeeName,
    accessoriesSales: Math.round(aksSales),
    vapeSales: Math.round(vapeSales),
    planValue: plan,
    bonusPlan,
    bonusAccessories,
    totalBonus,
    okladDaily,
  };

  // Save to salary_data cache
  await db.prepare(`
    INSERT OR REPLACE INTO salary_data 
    (date_val, shop_uuid, employee_uuid, employee_name, shop_name,
     accessories_sales, vape_sales, plan_value, bonus_plan, bonus_accessories, total_bonus, oklad_daily, calculated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(
    date, shopUuid, employeeUuid, employeeName, shopName,
    result.accessoriesSales, result.vapeSales, result.planValue,
    result.bonusPlan, result.bonusAccessories, result.totalBonus, result.okladDaily,
  ).run();

  logger.info("Salary calculated", {
    date, shop: shopName, employee: employeeUuid.slice(-8),
    vapeSales: result.vapeSales, plan: result.planValue,
    bonusPlan: result.bonusPlan, bonusAks: result.bonusAccessories, total: result.totalBonus,
  });

  return result;
}

/** Get salary report for an employee over a period. Uses cache when available. */
export async function getSalaryReport(
  db: D1Adapter,
  evo: DuckDBDataService,
  employeeUuid: string,
  startDate: string,   // YYYY-MM-DD
  endDate: string,     // YYYY-MM-DD
): Promise<SalaryReport> {
  const employeeName = await evo.getEmployeeByUuid(employeeUuid) || "";
  const config = await getSalaryConfig(db);

  const days = getDateRange(startDate, endDate);
  const details: DailySalary[] = [];
  let totalOklad = 0, totalBonusAccessories = 0, totalBonusPlan = 0, totalBonus = 0;

  for (const date of days) {
    // Check cache first
    const cached = await db.prepare(
      "SELECT * FROM salary_data WHERE date_val = ? AND employee_uuid = ? AND calculated_at IS NOT NULL ORDER BY calculated_at DESC LIMIT 1"
    ).bind(date, employeeUuid).first<any>();

    if (cached && cached.vape_sales !== null) {
      details.push({
        date,
        shopUuid: cached.shop_uuid,
        shopName: cached.shop_name || "",
        employeeUuid: cached.employee_uuid,
        employeeName: cached.employee_name || employeeName,
        accessoriesSales: cached.accessories_sales || 0,
        vapeSales: cached.vape_sales || 0,
        planValue: cached.plan_value || 0,
        bonusPlan: cached.bonus_plan || 0,
        bonusAccessories: cached.bonus_accessories || 0,
        totalBonus: cached.total_bonus || 0,
        okladDaily: cached.oklad_daily || 0,
      });
    } else {
      // Find which shop the employee worked at via sessions
      const session = await db.prepare(`
        SELECT store_uuid, store_name FROM sessions 
        WHERE open_user_uuid = ? 
          AND open_date >= ? AND open_date <= ?
        ORDER BY open_date ASC LIMIT 1
      `).bind(
        employeeUuid,
        `${date}T00:00:00+03:00`,
        `${date}T23:59:59+03:00`,
      ).first<{ store_uuid: string; store_name: string }>();

      if (!session?.store_uuid) {
        logger.debug("No session found for employee on date", { employeeUuid: employeeUuid.slice(-8), date });
        continue;
      }

      const daily = await calculateDaily(db, evo, date, session.store_uuid, employeeUuid, config);
      details.push(daily);
    }
  }

  for (const d of details) {
    totalOklad += d.okladDaily;
    totalBonusAccessories += d.bonusAccessories;
    totalBonusPlan += d.bonusPlan;
    totalBonus += d.totalBonus;
  }

  logger.info("Salary report generated", {
    employee: employeeName, period: `${startDate}-${endDate}`,
    days: details.length, totalBonus,
  });

  return {
    employeeName,
    startDate,
    endDate,
    workingDays: details.length,
    totalOklad,
    totalBonusAccessories,
    totalBonusPlan,
    totalBonus,
    totalPayout: totalOklad + totalBonus,
    details,
  };
}

/** Dashboard summary — current month bonuses + today's projection. */
export async function getDashboardSalary(
  db: D1Adapter,
): Promise<{
  monthBonus: number;
  monthOklad: number;
  todayPlans: Array<{ shop: string; vape: number; plan: number; met: boolean; bonus: number }>;
}> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  // Month totals from cache
  const monthRow = await db.prepare(`
    SELECT CAST(COALESCE(SUM(total_bonus), 0) AS DOUBLE) as bonus, CAST(COALESCE(SUM(oklad_daily), 0) AS DOUBLE) as oklad
    FROM salary_data WHERE date_val >= ? AND date_val <= ?
  `).bind(monthStart, today).first<{ bonus: number; oklad: number }>();

  // Today's plan status per shop
  const shopRows = await db.prepare(`
    SELECT s.store_uuid, s.store_name,
      COALESCE(CAST(SUM(CASE WHEN vg.group_uuid IS NOT NULL THEN p.sum ELSE 0 END) AS DOUBLE), 0) as vape
    FROM sells s
    JOIN positions p ON p.doc_id = s.doc_id
    LEFT JOIN product_groups pg ON pg.product_name = p.product_name AND pg.store_uuid = s.store_uuid
    LEFT JOIN vape_groups vg ON pg.parent_uuid = vg.group_uuid
    WHERE s.close_date >= ? AND s.close_date <= ?
    GROUP BY s.store_uuid, s.store_name
  `).bind(`${today}T00:00:00+03:00`, `${today}T23:59:59+03:00`).all<{
    store_uuid: string; store_name: string; vape: number;
  }>();

  const planRows = await db.prepare(
    "SELECT shop_uuid, daily_plan FROM plan WHERE month = ?"
  ).bind(today.slice(0, 7)).all<{ shop_uuid: string; daily_plan: number }>();
  const plans: Record<string, number> = {};
  for (const r of (planRows.results || [])) plans[r.shop_uuid] = r.daily_plan;

  const todayPlans = (shopRows.results || []).map(r => {
    const plan = plans[r.store_uuid] || 0;
    const vape = Math.round(r.vape || 0);
    const met = vape >= plan;
    return { shop: r.store_name, vape, plan, met, bonus: met ? 450 : 0 };
  });

  return {
    monthBonus: Number(monthRow?.bonus || 0),
    monthOklad: Number(monthRow?.oklad || 0),
    todayPlans,
  };
}

/** Batch recalculate salary for a period — saves to DB. */
export async function recalculatePeriod(
  db: D1Adapter,
  evo: DuckDBDataService,
  startDate: string,
  endDate: string,
): Promise<{ recalculated: number; errors: number }> {
  const days = getDateRange(startDate, endDate);
  let recalculated = 0, errors = 0;

  for (const date of days) {
    // Find employees who worked (opened sessions)
    const sessions = await db.prepare(`
      SELECT DISTINCT open_user_uuid, store_uuid
      FROM sessions
      WHERE open_date >= ? AND open_date <= ?
        AND open_user_uuid IS NOT NULL
    `).bind(`${date}T00:00:00+03:00`, `${date}T23:59:59+03:00`).all<{
      open_user_uuid: string; store_uuid: string;
    }>();

    for (const s of (sessions.results || [])) {
      try {
        await calculateDaily(db, evo, date, s.store_uuid, s.open_user_uuid);
        recalculated++;
      } catch (err) {
        logger.error("Salary recalc failed", { date, shop: s.store_uuid, employee: s.open_user_uuid, error: String(err) });
        errors++;
      }
    }
  }

  logger.info("Batch recalc done", { startDate, endDate, recalculated, errors });
  return { recalculated, errors };
}

/** Generate array of dates between start and end (inclusive). */
function getDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(`${start}T00:00:00+03:00`);
  const endDate = new Date(`${end}T00:00:00+03:00`);
  while (current <= endDate) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}
