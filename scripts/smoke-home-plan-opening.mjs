import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(path) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function expectPattern(source, pattern, message) {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
}

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const appTsx = read("packages/frontend/src/App.tsx");
const homeTsx = read("packages/frontend/src/pages/Home.tsx");
const evotorRoutesTs = read("packages/backend/src/routes/evotor.ts");
const storesRoutesTs = read("packages/backend/src/routes/stores.ts");

run("home-route-wiring", () => {
  expectPattern(appTsx, /<Route path="\/" element={<Home \/>} \/>/, "Missing home route");
  expectPattern(
    appTsx,
    /<Route\s+path="\/evotor\/plan-for-today"[\s\S]*element={<PlanSalesReport \/>}/,
    "Missing plan route"
  );
  expectPattern(
    homeTsx,
    /<PlanStatusCards \/>/,
    "Home screen does not render PlanStatusCards"
  );
  expectPattern(
    homeTsx,
    /<DashboardSummary2 onAiSectionDataChange={setAiSectionData} \/>/,
    "Home screen does not render DashboardSummary2"
  );
});

run("plan-api-wiring", () => {
  expectPattern(
    evotorRoutesTs,
    /\.get\("\/financial"/,
    "Missing /api/evotor/financial route"
  );
  expectPattern(
    evotorRoutesTs,
    /\.get\("\/plan-for-today"/,
    "Missing /api/evotor/plan-for-today route"
  );
  expectPattern(
    evotorRoutesTs,
    /\.get\("\/current-work-shop"/,
    "Missing /api/evotor/current-work-shop route"
  );
});

run("opening-flow-wiring", () => {
  expectPattern(
    appTsx,
    /<Route path="\/evotor\/open-store" element={<StoreOpeningPage \/>} \/>/,
    "Missing opening page route"
  );
  expectPattern(
    storesRoutesTs,
    /\.post\("\/open-store"/,
    "Missing /api/stores/open-store endpoint"
  );
});

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
