type AlertSeverity = "info" | "warning" | "critical";
type AlertType = "tempo_alert" | "anomaly" | "dead_stock";

export type RatingRow = {
  shopUuid: string;
  revenue: number;
  checks: number;
};

export type HeatmapRow = {
  dayOfWeek: number;
  hour: number;
  revenue: number;
};

export type DeepEmployee = {
  name: string;
  riskScore: number;
  refundRatePct: number;
  reasons?: string[];
  recommendations?: string[];
};

export type AlertRow = {
  id: number;
  shopUuid: string;
  alertType: AlertType;
  severity: AlertSeverity;
  triggeredAt: string;
  message: string;
};

export type ShiftSummaryRow = {
  id: number;
  shopUuid: string;
  date: string;
  summaryText?: string;
  revenueActual?: number | null;
  revenuePlan?: number | null;
  topEmployee?: string | null;
};

export function buildHeatmap(rows: HeatmapRow[]) {
  const map = new Map<string, number>();
  let max = 0;

  for (const row of rows) {
    const key = `${row.dayOfWeek}:${row.hour}`;
    const value = Number(row.revenue || 0);
    map.set(key, value);
    if (value > max) max = value;
  }

  return { map, max };
}

export function getUniqueShopUuids<T extends { shopUuid: string }>(rows: T[]) {
  return Array.from(new Set(rows.map((row) => row.shopUuid)));
}

export function filterShiftSummaries(
  rows: ShiftSummaryRow[],
  shopFilter: string,
  dateFilter: string,
) {
  return rows.filter((row) => {
    if (shopFilter !== "all" && row.shopUuid !== shopFilter) return false;
    if (dateFilter && row.date !== dateFilter) return false;
    return true;
  });
}

export function filterAlertsHistory(
  rows: AlertRow[],
  shopFilter: string,
  typeFilter: "all" | AlertType,
  dateFilter: string,
) {
  return rows.filter((row) => {
    if (shopFilter !== "all" && row.shopUuid !== shopFilter) return false;
    if (typeFilter !== "all" && row.alertType !== typeFilter) return false;
    if (dateFilter && !row.triggeredAt.startsWith(dateFilter)) return false;
    return true;
  });
}

export function parseKpiNarrativeSections(narrative: string | null) {
  const source = (narrative || "").trim();
  if (!source) {
    return {
      strengths: [] as string[],
      growth: [] as string[],
      actions: [] as string[],
      raw: "",
    };
  }

  const lines = source
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const normalize = (line: string) =>
    line
      .replace(/^[\d\)\.\-\s•]+/, "")
      .trim();

  const strengths: string[] = [];
  const growth: string[] = [];
  const actions: string[] = [];

  let mode: "strengths" | "growth" | "actions" | null = null;
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes("сильн")) {
      mode = "strengths";
      continue;
    }
    if (lower.includes("зон") || lower.includes("рост")) {
      mode = "growth";
      continue;
    }
    if (lower.includes("действ") || lower.includes("следующ")) {
      mode = "actions";
      continue;
    }

    const item = normalize(line);
    if (!item) continue;
    if (mode === "strengths") strengths.push(item);
    else if (mode === "growth") growth.push(item);
    else if (mode === "actions") actions.push(item);
  }

  return { strengths, growth, actions, raw: source };
}

export function buildSystemStatus(
  loading: boolean,
  alertsHistory: AlertRow[],
  deepEmployees: DeepEmployee[],
) {
  if (loading) {
    return {
      icon: "🟡",
      label: "Обновление данных",
      tone: "text-amber-700 dark:text-amber-300",
      bg: "bg-amber-50 dark:bg-amber-950/30",
    };
  }

  const critical = alertsHistory.filter((item) => item.severity === "critical").length;
  const warning = alertsHistory.filter((item) => item.severity === "warning").length;
  const riskyEmployees = deepEmployees.filter((item) => item.riskScore >= 75).length;

  if (critical > 0) {
    return {
      icon: "🔴",
      label: `Критично: ${critical} сигнал(ов)`,
      tone: "text-red-700 dark:text-red-300",
      bg: "bg-red-50 dark:bg-red-950/30",
    };
  }
  if (warning > 0 || riskyEmployees > 0) {
    return {
      icon: "🟡",
      label: `Есть проблемы: ${warning + riskyEmployees}`,
      tone: "text-amber-700 dark:text-amber-300",
      bg: "bg-amber-50 dark:bg-amber-950/30",
    };
  }
  return {
    icon: "🟢",
    label: "Система стабильна",
    tone: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
  };
}

export function buildTopKpi(rating: RatingRow[]) {
  const totalRevenue = rating.reduce((sum, row) => sum + Number(row.revenue || 0), 0);
  const totalChecks = rating.reduce((sum, row) => sum + Number(row.checks || 0), 0);
  const avgCheck = totalChecks > 0 ? totalRevenue / totalChecks : 0;
  const weakShops = rating.filter((row) => Number(row.revenue || 0) < avgCheck * 10).length;
  return { totalRevenue, totalChecks, avgCheck, weakShops };
}

export function buildDirectorDecisions(deepEmployees: DeepEmployee[]) {
  return deepEmployees.slice(0, 3).map((employee) => ({
    employeeName: employee.name,
    problem: employee.reasons?.[0] || "Падение эффективности смены",
    action:
      employee.recommendations?.[0] ||
      "Провести разбор смены и назначить корректирующее действие",
    risk: Math.round(employee.riskScore),
  }));
}

export function buildProblemsSummary(alertsHistory: AlertRow[], deepEmployees: DeepEmployee[]) {
  const criticalAlerts = alertsHistory.filter((item) => item.severity === "critical");
  const warningAlerts = alertsHistory.filter((item) => item.severity === "warning");
  const riskyEmployees = deepEmployees.filter((item) => item.riskScore >= 75);
  const highRefundEmployees = deepEmployees.filter((item) => item.refundRatePct >= 5);

  return {
    criticalAlerts,
    warningAlerts,
    riskyEmployees,
    highRefundEmployees,
  };
}

export function buildDecisionsLog(alertsHistory: AlertRow[]) {
  return alertsHistory.slice(0, 5).map((item) => ({
    id: item.id,
    when: item.triggeredAt,
    type: item.alertType,
    severity: item.severity,
    text: item.message,
  }));
}
