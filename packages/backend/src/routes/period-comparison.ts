import { Hono } from "hono";
import { logger } from "../logger";
import { getDataModeOrDefault } from "../dataMode";
import { formatDateWithTime, getIsoTimestamp } from "../utils";
import type { IContext } from "../types";

// Inline helpers (local to evotor.ts, not exported)
const shiftIsoDateKey = (isoDate: string, days: number) => {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const getDiffDaysInclusive = (since: string, until: string) => {
  const s = new Date(since + "T00:00:00");
  const u = new Date(until + "T00:00:00");
  return Math.round((u.getTime() - s.getTime()) / 86400000) + 1;
};
function getLocalTodayAndYesterdayKeys(tzOffsetMinutes: number) {
  const now = new Date();
  const localNow = new Date(now.getTime() + tzOffsetMinutes * 60000);
  const todayKey = localNow.toISOString().slice(0, 10);
  const yesterday = new Date(localNow.getTime() - 86400000);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);
  return { todayKey, yesterdayKey };
}
function buildUtcRangeForLocalDates(since: string, until: string, tzOffsetMinutes: number) {
  const offsetMs = tzOffsetMinutes * 60000;
  const sinceUtc = new Date(since + "T00:00:00.000").getTime() - offsetMs;
  const untilUtc = new Date(until + "T23:59:59.999").getTime() - offsetMs;
  return {
    since: new Date(sinceUtc).toISOString().replace("Z", ""),
    until: new Date(untilUtc).toISOString().replace("Z", ""),
  };
}

export const periodComparisonRoutes = new Hono()
  .post("/", async (c: IContext) => {
    try {
      const mode = await getDataModeOrDefault(c.env);
      const body = await c.req.json().catch(() => ({}));
      const since = body.since || shiftIsoDateKey(new Date().toISOString().slice(0, 10), -6);
      const until = body.until || new Date().toISOString().slice(0, 10);
      const shopUuid = body.shopUuid || "";

      const periodDays = getDiffDaysInclusive(since, until);
      const prevUntil = shiftIsoDateKey(since, -1);
      const prevSince = shiftIsoDateKey(prevUntil, -(periodDays - 1));
      const tzOffsetMinutes = Number(c.env.ALERT_TZ_OFFSET_MINUTES ?? 180);
      const { todayKey } = getLocalTodayAndYesterdayKeys(tzOffsetMinutes);

      const currentRange = buildUtcRangeForLocalDates(since, until, tzOffsetMinutes);
      const previousRange = buildUtcRangeForLocalDates(prevSince, prevUntil, tzOffsetMinutes);

      // Use the existing evotor financial endpoint
      const baseUrl = new URL(c.req.url);
      const headers = new Headers();
      for (const h of ["initData", "telegram-id", "authorization", "cookie"]) {
        const v = c.req.header(h);
        if (v) headers.set(h, v);
      }

      const [currentRes, previousRes] = await Promise.all([
        fetch(new URL(`/api/evotor/financial?since=${since}&until=${until}${shopUuid ? '&shopUuid=' + shopUuid : ''}`, baseUrl.origin), {
          headers,
        }),
        fetch(new URL(`/api/evotor/financial?since=${prevSince}&until=${prevUntil}${shopUuid ? '&shopUuid=' + shopUuid : ''}`, baseUrl.origin), {
          headers,
        }),
      ]);

      const currentFinancial: any = await currentRes.json().catch(() => ({}));
      const previousFinancial: any = await previousRes.json().catch(() => ({}));

      const pctChange = (curr: number, prev: number) => {
        if (prev <= 0) return curr > 0 ? 100 : 0;
        return Math.round(((curr - prev) / prev) * 100);
      };

      const stores: Array<{
        name: string;
        currentRevenue: number; prevRevenue: number; revenueChange: number;
        currentChecks: number; prevChecks: number; checksChange: number;
        currentRefund: number; prevRefund: number;
      }> = [];

      const currentShops = currentFinancial.salesDataByShopName || {};
      const prevShops = previousFinancial.salesDataByShopName || {};

      for (const name of new Set([...Object.keys(currentShops), ...Object.keys(prevShops)])) {
        const cur = currentShops[name] || { totalSell: 0, checksCount: 0, refund: {} };
        const prev = prevShops[name] || { totalSell: 0, checksCount: 0, refund: {} };
        const curRefund = Object.values(cur.refund || {}).reduce((s: number, v: any) => s + Number(v || 0), 0);
        const prevRefund = Object.values(prev.refund || {}).reduce((s: number, v: any) => s + Number(v || 0), 0);
        stores.push({
          name,
          currentRevenue: cur.totalSell || 0,
          prevRevenue: prev.totalSell || 0,
          revenueChange: pctChange(cur.totalSell || 0, prev.totalSell || 0),
          currentChecks: cur.checksCount || 0,
          prevChecks: prev.checksCount || 0,
          checksChange: pctChange(cur.checksCount || 0, prev.checksCount || 0),
          currentRefund: curRefund,
          prevRefund,
        });
      }
      stores.sort((a, b) => b.currentRevenue - a.currentRevenue);

      const curTotal = currentFinancial.grandTotalSell || 0;
      const prevTotal = previousFinancial.grandTotalSell || 0;
      const curChecks = currentFinancial.totalChecks || 0;
      const prevChecks = previousFinancial.totalChecks || 0;
      const curRefund = currentFinancial.grandTotalRefund || 0;
      const prevRefund = previousFinancial.grandTotalRefund || 0;

      const topProducts = (currentFinancial.topProducts || []).slice(0, 10);

      return c.json({
        period: { since, until },
        prevPeriod: { since: prevSince, until: prevUntil },
        totals: {
          revenue: { current: curTotal, previous: prevTotal, change: pctChange(curTotal, prevTotal) },
          checks: { current: curChecks, previous: prevChecks, change: pctChange(curChecks, prevChecks) },
          refund: { current: curRefund, previous: prevRefund, change: pctChange(curRefund, prevRefund) },
        },
        stores,
        topProducts,
      });
    } catch (err) {
      logger.error("period-comparison error", { error: String(err) });
      return c.json({ error: "Не удалось загрузить сравнение периодов" }, 500);
    }
  });
