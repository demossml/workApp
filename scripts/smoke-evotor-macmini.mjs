const BASE_URL = process.env.SMOKE_BASE_URL || "https://app.gimolost2.ru";
const TELEGRAM_ID = process.env.SMOKE_TELEGRAM_ID || "5700958253";
const INIT_DATA = process.env.SMOKE_INIT_DATA || "guest";
const ALLOW_EMPTY_SHOPS = process.env.SMOKE_ALLOW_EMPTY_SHOPS === "1";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dateDDMMYYYY(date = new Date()) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  return `${dd}-${mm}-${yyyy}`;
}

function dateYYYYMMDD(date = new Date()) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  return `${yyyy}-${mm}-${dd}`;
}

async function requestJson(path, { method = "GET", body } = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    initData: INIT_DATA,
    "telegram-id": TELEGRAM_ID,
    "x-trace-id": `smoke-evotor-${Date.now()}`,
  };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();

  let json = null;
  if (text.length > 0) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`${path}: invalid JSON (${res.status}) -> ${text.slice(0, 300)}`);
    }
  }

  if (!res.ok) {
    throw new Error(`${path}: HTTP ${res.status} -> ${JSON.stringify(json)}`);
  }

  return json;
}

async function checkHealth() {
  const data = await requestJson("/api/health");
  assert(isObject(data), "/api/health: object expected");
  assert(data.status === "ok" || data.status === "degraded", "/api/health: invalid status");
  assert(isObject(data.checks?.database), "/api/health: checks.database missing");
  assert(data.checks.database.ok === true, "/api/health: database check is not ok");
}

async function checkShopsNames() {
  const data = await requestJson("/api/stores/shops-names");
  assert(Array.isArray(data?.shopsName), "/api/stores/shops-names: shopsName must be array");
  if (!ALLOW_EMPTY_SHOPS) {
    assert(data.shopsName.length > 0, "/api/stores/shops-names: empty list (stores are not loaded)");
  }
}

async function checkShopsOpeningStatus() {
  const data = await requestJson("/api/stores/shops-opening-status", {
    method: "POST",
    body: { date: dateDDMMYYYY() },
  });
  assert(
    Array.isArray(data?.shopsNameAndUuid),
    "/api/stores/shops-opening-status: shopsNameAndUuid must be array"
  );
  if (!ALLOW_EMPTY_SHOPS) {
    assert(
      data.shopsNameAndUuid.length > 0,
      "/api/stores/shops-opening-status: empty list (stores are not loaded)"
    );
  }
}

async function checkSettingsConfig() {
  const data = await requestJson("/api/evotor/settings-config");
  assert(Array.isArray(data?.groupOptions), "/api/evotor/settings-config: groupOptions must be array");
  assert(Array.isArray(data?.selectedGroupUuids), "/api/evotor/settings-config: selectedGroupUuids must be array");
  assert(Array.isArray(data?.selectedGroupNames), "/api/evotor/settings-config: selectedGroupNames must be array");
  assert(typeof data?.salary === "number", "/api/evotor/settings-config: salary must be number");
  assert(typeof data?.bonus === "number", "/api/evotor/settings-config: bonus must be number");
}

async function checkPlanForToday() {
  const data = await requestJson("/api/evotor/plan-for-today");
  assert(isObject(data), "/api/evotor/plan-for-today: object expected");
  assert(isObject(data?.salesData), "/api/evotor/plan-for-today: salesData must be object");
}

async function checkFinancial() {
  const day = dateYYYYMMDD();
  const data = await requestJson(`/api/evotor/financial?since=${day}&until=${day}`);
  assert(isObject(data), "/api/evotor/financial: object expected");
  assert(
    typeof data?.grandTotalSell === "number",
    "/api/evotor/financial: grandTotalSell must be number"
  );
}

async function checkRefundDocuments() {
  const day = dateYYYYMMDD();
  const data = await requestJson(
    `/api/analytics/revenue/refund-documents?since=${day}&until=${day}&limit=120`
  );
  assert(Array.isArray(data?.documents), "/api/analytics/revenue/refund-documents: documents must be array");
}

async function runCheck(name, fn) {
  const started = Date.now();
  try {
    await fn();
    console.log(`PASS ${name} (${Date.now() - started}ms)`);
    return null;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`FAIL ${name} (${Date.now() - started}ms): ${reason}`);
    return `${name}: ${reason}`;
  }
}

async function main() {
  console.log(`Smoke Evotor (Mac mini): ${BASE_URL}`);
  const failures = [];
  failures.push(await runCheck("health", checkHealth));
  failures.push(await runCheck("stores-shops-names", checkShopsNames));
  failures.push(await runCheck("stores-shops-opening-status", checkShopsOpeningStatus));
  failures.push(await runCheck("evotor-settings-config", checkSettingsConfig));
  failures.push(await runCheck("evotor-plan-for-today", checkPlanForToday));
  failures.push(await runCheck("evotor-financial", checkFinancial));
  failures.push(await runCheck("analytics-refund-documents", checkRefundDocuments));

  const errors = failures.filter(Boolean);
  if (errors.length > 0) {
    console.error("\nSmoke summary:");
    for (const err of errors) console.error(`- ${err}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
