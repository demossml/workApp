// One-shot script to sync Evotor index documents into DuckDB
// Usage: npx tsx src/jobs/runIndexSync.ts

import { Evotor } from "../evotor";
import { KVStore } from "../kv-store";
import { createD1Adapter } from "../db-duckdb";
import { runEvotorDocumentsIndexingJob } from "./indexEvotorDocuments";

const token = process.env.EVOTOR_API_TOKEN || "";
if (!token) {
  console.error("EVOTOR_API_TOKEN not set");
  process.exit(1);
}

const bindings: any = {
  EVOTOR_API_TOKEN: token,
  KV: new KVStore(),
  DB: createD1Adapter(),
  DISABLE_EVOTOR_CRON: "0",
};

console.log("Starting index documents sync...");
runEvotorDocumentsIndexingJob(bindings)
  .then(() => {
    console.log("Sync completed successfully");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Sync failed:", err);
    process.exit(1);
  });
