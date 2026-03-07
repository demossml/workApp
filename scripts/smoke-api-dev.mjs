const BASE_URL = process.env.BACKEND_BASE_URL || "http://127.0.0.1:8787";
const TELEGRAM_ID = process.env.SMOKE_TELEGRAM_ID || "smoke-user";

const defaultHeaders = {
  initData: "guest",
  "telegram-id": TELEGRAM_ID,
  "x-trace-id": `smoke-${Date.now()}`,
};

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertFiniteNumber(value, label) {
  assert(typeof value === "number" && Number.isFinite(value), `${label} must be a finite number`);
}

function assertString(value, label) {
  assert(typeof value === "string", `${label} must be a string`);
}

function assertBoolean(value, label) {
  assert(typeof value === "boolean", `${label} must be a boolean`);
}

async function fetchJson(path) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, { headers: defaultHeaders });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Invalid JSON at ${path}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} at ${path}: ${JSON.stringify(json)}`);
  }
  return json;
}

function validateFinancialMetrics(payload) {
  assert(isRecord(payload), "financial response must be an object");
  assert(isRecord(payload.salesDataByShopName), "salesDataByShopName must be an object");
  assertFiniteNumber(payload.grandTotalSell, "grandTotalSell");
  assertFiniteNumber(payload.grandTotalRefund, "grandTotalRefund");
  assertFiniteNumber(payload.grandTotalCashOutcome, "grandTotalCashOutcome");
  assertFiniteNumber(payload.totalChecks, "totalChecks");
  assert(Array.isArray(payload.topProducts), "topProducts must be an array");
  assert(isRecord(payload.cashOutcomeData), "cashOutcomeData must be an object");
}

function validatePlanForToday(payload) {
  assert(isRecord(payload), "plan-for-today response must be an object");
  assert(isRecord(payload.salesData), "salesData must be an object");
  for (const [shopName, shopData] of Object.entries(payload.salesData)) {
    assertString(shopName, "shopName");
    if (shopData === null) continue;
    assert(isRecord(shopData), `salesData.${shopName} must be object or null`);
    assertFiniteNumber(shopData.datePlan, `salesData.${shopName}.datePlan`);
    assertFiniteNumber(shopData.dataSales, `salesData.${shopName}.dataSales`);
    assert(
      shopData.dataQuantity === null || isRecord(shopData.dataQuantity),
      `salesData.${shopName}.dataQuantity must be object or null`
    );
  }
}

function validateWorkingByShops(payload) {
  assert(isRecord(payload), "working-by-shops response must be an object");
  assert(isRecord(payload.byShop), "byShop must be an object");
  for (const [shopName, row] of Object.entries(payload.byShop)) {
    assertString(shopName, "shopName");
    assert(isRecord(row), `byShop.${shopName} must be an object`);
    assertString(row.shopUuid, `byShop.${shopName}.shopUuid`);
    assertBoolean(row.opened, `byShop.${shopName}.opened`);
    assert(
      row.employeeUuid === null || typeof row.employeeUuid === "string",
      `byShop.${shopName}.employeeUuid must be string|null`
    );
    assert(
      row.employeeName === null || typeof row.employeeName === "string",
      `byShop.${shopName}.employeeName must be string|null`
    );
  }
}

function validateCurrentWorkShop(payload) {
  assert(isRecord(payload), "current-work-shop response must be an object");
  assertString(payload.uuid, "uuid");
  assertString(payload.name, "name");
  assertBoolean(payload.isWorkingToday, "isWorkingToday");
}

function validateOpenTimes(payload) {
  assert(isRecord(payload), "open-times response must be an object");
  assert(isRecord(payload.dataReport), "dataReport must be an object");
  for (const [shopName, openInfo] of Object.entries(payload.dataReport)) {
    assertString(shopName, "shopName");
    assertString(openInfo, `dataReport.${shopName}`);
  }
}

function validateFinancialReconciliation(payload) {
  assert(isRecord(payload), "financial-reconciliation response must be an object");
  assert(isRecord(payload.period), "period must be an object");
  assertString(payload.period.since, "period.since");
  assertString(payload.period.until, "period.until");
  assertFiniteNumber(payload.thresholdPct, "thresholdPct");
  assertBoolean(payload.withinThreshold, "withinThreshold");
  assertFiniteNumber(payload.totalNetMismatchAbs, "totalNetMismatchAbs");
  assertFiniteNumber(payload.totalNetMismatchPct, "totalNetMismatchPct");
  assert(isRecord(payload.summary), "summary must be an object");
  assert(Array.isArray(payload.byShop), "byShop must be an array");
}

async function runCheck(name, path, validator) {
  const startedAt = Date.now();
  try {
    const payload = await fetchJson(path);
    validator(payload);
    const ms = Date.now() - startedAt;
    console.log(`PASS ${name} (${ms}ms)`);
    return null;
  } catch (error) {
    const ms = Date.now() - startedAt;
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`FAIL ${name} (${ms}ms): ${reason}`);
    return `${name}: ${reason}`;
  }
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  console.log(`Smoke API base URL: ${BASE_URL}`);

  const failures = [];

  failures.push(await runCheck(
    "financial",
    `/api/evotor/financial?since=${today}&until=${today}`,
    validateFinancialMetrics
  ));
  failures.push(await runCheck("plan-for-today", "/api/evotor/plan-for-today", validatePlanForToday));
  failures.push(await runCheck("working-by-shops", "/api/evotor/working-by-shops", validateWorkingByShops));
  failures.push(await runCheck("current-work-shop", "/api/evotor/current-work-shop", validateCurrentWorkShop));
  failures.push(await runCheck("open-times", "/api/schedules/schedule", validateOpenTimes));
  failures.push(
    await runCheck(
      "analytics-financial-reconciliation",
      `/api/analytics/reconciliation/financial?since=${today}&until=${today}`,
      validateFinancialReconciliation
    )
  );

  const errors = failures.filter(Boolean);
  if (errors.length > 0) {
    console.error("\nSmoke API summary:");
    for (const err of errors) {
      console.error(`- ${err}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Smoke API failed:");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
