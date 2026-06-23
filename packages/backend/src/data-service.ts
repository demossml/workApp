// DuckDB Data Service — replaces direct Evotor API calls
import { createD1Adapter } from "./db-duckdb";
import type { D1Adapter } from "./db-duckdb";

export class DuckDBDataService {
  private db: D1Adapter;

  constructor() {
    this.db = createD1Adapter();
  }

  // Store UUID → name mapping
  private storeNames: Record<string, string> = {
    "20251229-316B-40A1-80F7-C59E5B8E6831": "Победа",
    "20260103-7090-403D-8015-DE08E5B1138E": "45",
    "20260103-425F-4044-8093-F2008B89A33B": "Твардоского",
  };

  private resolveName(uuid: string): string {
    return this.storeNames[uuid] || uuid.slice(0, 8);
  }

  // ─── Shops ───────────────────────────────────────────
  async getShopUuids(): Promise<string[]> { return Object.keys(this.storeNames); }
  async getShops() { return this.getShopUuids(); }

  async getShopNameUuids(): Promise<Array<{ uuid: string; name: string }> | null> {
    const uuids = await this.getShopUuids();
    return uuids.map(uuid => ({ uuid, name: this.resolveName(uuid) }));
  }

  async getShopNamesByUuids(uuids: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const u of uuids) result[u] = this.resolveName(u);
    return result;
  }

  async getShopNameUuidsDict(): Promise<Record<string, string> | null> {
    const uuids = await this.getShopUuids();
    const result: Record<string, string> = {};
    for (const u of uuids) result[u] = this.resolveName(u);
    return result;
  }

  async getShopsName(): Promise<string[]> { return Object.values(this.storeNames); }
  getShopName = async (shopUuid: string): Promise<string> => this.resolveName(shopUuid);

  // ─── Employees ───────────────────────────────────────
  async getEmployees(): Promise<any[]> {
    const r = await this.db.prepare(`SELECT * FROM employees`).all();
    return r.results;
  }

  async getEmployeeRole(userId: string): Promise<string | null> {
    const r = await this.db.prepare(`SELECT role FROM employees WHERE uuid = ? LIMIT 1`).bind(userId).first<{ role: string }>();
    return r?.role || null;
  }

  async getEmployeeByUuid(uuid: string): Promise<string | null> {
    const r = await this.db.prepare(`SELECT first_name, last_name FROM employees WHERE uuid = ? LIMIT 1`).bind(uuid).first<{ first_name: string; last_name: string }>();
    if (!r) return null;
    return [r.first_name, r.last_name].filter(Boolean).join(" ") || uuid.slice(0, 8);
  }

  async getEmployeeLastName(userId: string): Promise<string | null> {
    const r = await this.db.prepare(`SELECT last_name FROM employees WHERE uuid = ? LIMIT 1`).bind(userId).first<{ last_name: string }>();
    return r?.last_name || null;
  }

  async getEmployeesByLastName(userId: string): Promise<any> {
    return this.db.prepare(`SELECT * FROM employees WHERE uuid = ? LIMIT 1`).bind(userId).first();
  }

  async getEmployeesLastNameAndUuid(): Promise<Array<{ uuid: string; name: string }>> {
    const r = await this.db.prepare(`SELECT uuid, CONCAT(first_name, ' ', last_name) AS name FROM employees WHERE uuid IS NOT NULL`).all<{ uuid: string; name: string }>();
    return r.results.filter(e => e.uuid && e.name);
  }

  async getEmployeesLastNameAndUuidDict(): Promise<Record<string, string>> {
    const r = await this.db.prepare(`SELECT uuid, CONCAT(first_name, ' ', last_name) AS name FROM employees WHERE uuid IS NOT NULL`).all<{ uuid: string; name: string }>();
    const result: Record<string, string> = {};
    for (const e of r.results) { if (e.uuid && e.name) result[e.uuid] = e.name; }
    return result;
  }

  async getEmployeesByShopId(shopId: string): Promise<Array<{ uuid: string; name: string }>> {
    const r = await this.db.prepare(`SELECT uuid, CONCAT(first_name, ' ', last_name) AS name FROM employees`).all<{ uuid: string; name: string }>();
    return r.results.filter(e => e.uuid && e.name);
  }

  async getEmployeeNamesByUuids(uuids: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const uuid of uuids) { const name = await this.getEmployeeByUuid(uuid); if (name) result[uuid] = name; }
    return result;
  }

  // ─── Groups ──────────────────────────────────────────
  async getGroupsByNameUuid(shopUuid: string): Promise<any[]> {
    return (await this.db.prepare(`SELECT DISTINCT group_name AS name, parent_uuid AS uuid FROM product_groups WHERE store_uuid = ?`).bind(shopUuid).all()).results;
  }

  async getGroupsByName(shopUuid: string, groupNames: string[]): Promise<any[]> {
    if (!groupNames?.length) return [];
    const ph = groupNames.map(() => "?").join(",");
    return (await this.db.prepare(`SELECT group_name AS name, parent_uuid AS uuid FROM product_groups WHERE store_uuid = ? AND group_name IN (${ph})`).bind(shopUuid, ...groupNames).all()).results;
  }

  // ─── Products by Group ─────────────────────────────
  getProductsByGroup = async (shopUuid: string, groups: string[]): Promise<string[]> => {
    if (!groups?.length) return [];
    const ph = groups.map(() => "?").join(",");
    return (await this.db.prepare(`SELECT DISTINCT product_uuid FROM product_groups WHERE store_uuid = ? AND parent_uuid IN (${ph})`).bind(shopUuid, ...groups).all<{ product_uuid: string }>()).results.map(r => r.product_uuid);
  };

  getProductStockByGroups = async (shopId: string, groupIds: string[]): Promise<Record<string, { name: string; quantity: number; costPrice: number }>> => {
    // We don't have real-time stock data in DuckDB — return empty
    return {};
  };

  getStockByGroup = async (shopId: string, groupIds: string[], priceKey: string): Promise<Record<string, { sum: number; quantity: number }>> => {
    return {};
  };

  // ─── Sales ───────────────────────────────────────────
  async getSalesToday(_db?: any): Promise<any> {
    const today = new Date().toISOString().slice(0, 10);
    return (await this.db.prepare(`SELECT s.store_uuid, SUM(s.close_sum) as total, CAST(COUNT(*) AS INTEGER) as checks FROM sells s WHERE DATE(s.close_date) = ? GROUP BY s.store_uuid`).bind(today).all()).results;
  }

  async getSalesSum(shopUuid: string, since: string, until: string, groupUuids?: string[]): Promise<number> {
    let q = `SELECT COALESCE(SUM(p.sum), 0) as total FROM positions p JOIN sells s ON p.doc_id = s.doc_id WHERE s.store_uuid = ? AND s.close_date >= ? AND s.close_date < ?`;
    const params: any[] = [shopUuid, since, until];
    if (groupUuids?.length) { q += ` AND p.commodity_uuid IN (${groupUuids.map(() => "?").join(",")})`; params.push(...groupUuids); }
    const r = await this.db.prepare(q).bind(...params).first<{ total: number }>();
    return r?.total || 0;
  }

  async getSalesSumQuantity(shopUuid: string, since: string, until: string, groupUuids?: string[]): Promise<{ sum: number; quantity: number }> {
    let q = `SELECT COALESCE(SUM(p.sum), 0) as total_sum, COALESCE(SUM(p.quantity), 0) as total_qty FROM positions p JOIN sells s ON p.doc_id = s.doc_id WHERE s.store_uuid = ? AND s.close_date >= ? AND s.close_date < ?`;
    const params: any[] = [shopUuid, since, until];
    if (groupUuids?.length) { q += ` AND p.commodity_uuid IN (${groupUuids.map(() => "?").join(",")})`; params.push(...groupUuids); }
    const r = await this.db.prepare(q).bind(...params).first<{ total_sum: number; total_qty: number }>();
    return { sum: r?.total_sum || 0, quantity: r?.total_qty || 0 };
  }

  async getSalesSumQuantitySum(
    db: any, shopId: string, since: string, until: string, productUuids: string[]
  ): Promise<Record<string, { quantitySale: number; sum: number }>> {
    if (!productUuids.length) return {};
    const ph = productUuids.map(() => "?").join(",");
    const r = await this.db.prepare(
      `SELECT p.product_name, CAST(SUM(p.quantity) AS INTEGER) as quantitySale, SUM(p.sum) as sum
       FROM positions p JOIN sells s ON p.doc_id = s.doc_id
       WHERE s.store_uuid = ? AND s.close_date >= ? AND s.close_date < ? AND p.commodity_uuid IN (${ph})
       GROUP BY p.product_name`
    ).bind(shopId, since, until, ...productUuids).all<{ product_name: string; quantitySale: number; sum: number }>();
    const result: Record<string, { quantitySale: number; sum: number }> = {};
    for (const row of r.results) result[row.product_name] = { quantitySale: row.quantitySale, sum: row.sum };
    return result;
  }

  async getSalesSumQuantitySumDirect(
    shopId: string, since: string, until: string, productUuids: string[]
  ): Promise<Record<string, { quantitySale: number; sum: number }>> {
    return this.getSalesSumQuantitySum(null as any, shopId, since, until, productUuids);
  }

  async getSalesSummary(params: {
    shopId: string; groups: string[]; since: string; until: string;
  }): Promise<Array<{ name: string; quantity: number; sold: number; lastSaleDate: string | null }>> {
    const productUuids = await this.getProductsByGroup(params.shopId, params.groups);
    if (!productUuids.length) return [];
    const ph = productUuids.map(() => "?").join(",");
    const r = await this.db.prepare(
      `SELECT p.product_name as name,
              CAST(SUM(p.quantity) AS INTEGER) as sold,
              MAX(s.close_date) as last_sale_date
       FROM positions p JOIN sells s ON p.doc_id = s.doc_id
       WHERE s.store_uuid = ? AND s.close_date >= ? AND s.close_date < ? AND p.commodity_uuid IN (${ph})
       GROUP BY p.product_name`
    ).bind(params.shopId, params.since, params.until, ...productUuids).all<{ name: string; sold: number; last_sale_date: string }>();
    // quantity (stock) is 0 since we don't have real-time stock
    return r.results.map(row => ({
      name: row.name,
      quantity: 0,
      sold: row.sold || 0,
      lastSaleDate: row.last_sale_date ? row.last_sale_date.slice(0, 10).split("-").reverse().join(".") : null,
    }));
  }

  // ─── Session ─────────────────────────────────────────
  async getFirstOpenSession(since: string, until: string, employeeUuid?: string): Promise<any> {
    let q = `SELECT * FROM sessions WHERE open_date >= ? AND open_date < ?`; const p: any[] = [since, until];
    if (employeeUuid) { q += ` AND open_user_uuid = ?`; p.push(employeeUuid); }
    const row = this.db.prepare(q + ` ORDER BY open_date ASC LIMIT 1`).bind(...p).first() as { store_uuid: string } | null;
    return row?.store_uuid ?? null;
  }

  // ─── Plan ────────────────────────────────────────────
  async getPlan(date: any): Promise<Record<string, number>> {
    const ds = typeof date === 'string' ? date : (date?.toISOString ? date.toISOString() : String(date));
    const r = await this.db.prepare(`SELECT shop_uuid, daily_plan FROM plan WHERE month = ?`).bind(ds.slice(0, 7)).all<{ shop_uuid: string; daily_plan: number }>();
    const plan: Record<string, number> = {};
    for (const row of r.results) plan[row.shop_uuid] = row.daily_plan;
    return plan;
  }

  // ─── Accessories / Vape ─────────────────────────────
  async getAccessoriesGroupUuids(): Promise<string[]> {
    return (await this.db.prepare(`SELECT group_uuid FROM accessories`).all<{ group_uuid: string }>()).results.map(r => r.group_uuid);
  }
  async getVapeGroupUuids(): Promise<string[]> {
    return (await this.db.prepare(`SELECT group_uuid FROM vape_groups`).all<{ group_uuid: string }>()).results.map(r => r.group_uuid);
  }

  // ─── Order (forecast) ────────────────────────────────
  async getOrder(params: {
    shopId: string; groups: string[]; since: string; until: string; periods: number;
  }): Promise<Record<string, Record<string, number>>> {
    const productUuids = await this.getProductsByGroup(params.shopId, params.groups);
    if (!productUuids.length) return {};
    const ph = productUuids.map(() => "?").join(",");
    // Return sales per product per day as { productName: { dateStr: sum } }
    const r = await this.db.prepare(
      `SELECT p.product_name as name, strftime(s.close_date, '%Y-%m-%d') as day, SUM(p.sum) as total
       FROM positions p JOIN sells s ON p.doc_id = s.doc_id
       WHERE s.store_uuid = ? AND s.close_date >= ? AND s.close_date < ? AND p.commodity_uuid IN (${ph})
       GROUP BY p.product_name, strftime(s.close_date, '%Y-%m-%d')
       ORDER BY day`
    ).bind(params.shopId, params.since, params.until, ...productUuids).all<{ name: string; day: string; total: number }>();
    const result: Record<string, Record<string, number>> = {};
    for (const row of r.results) {
      if (!result[row.name]) result[row.name] = {};
      result[row.name][row.day] = row.total;
    }
    return result;
  }

  // ─── Financial ───────────────────────────────────────
  async getDocumentsBySellPayback(shopUuid: any, since?: string, until?: string): Promise<any[]> {
    const shop = Array.isArray(shopUuid) ? shopUuid[0] : shopUuid;
    if (!shop || !since || !until) return [];

    const sells = await this.db.prepare(`
      SELECT doc_id, store_uuid, close_date, close_sum
      FROM sells
      WHERE store_uuid = ? AND close_date >= ? AND close_date < ?
    `).bind(shop, since, until).all<{ doc_id: string; store_uuid: string; close_date: string; close_sum: number }>();

    const documents: any[] = [];
    for (const s of sells.results) {
      const payments = await this.db.prepare(`
        SELECT payment_type, sum FROM payments WHERE doc_id = ?
      `).bind(s.doc_id).all<{ payment_type: string; sum: number }>();

      documents.push({
        type: "SELL",
        closeDate: s.close_date,
        number: s.doc_id.slice(0, 8),
        openUserUuid: "",
        storeUuid: s.store_uuid,
        transactions: payments.results.map(p => ({
          type: "PAYMENT",
          paymentType: p.payment_type || "CASH",
          sum: p.sum,
        })),
      });
    }
    return documents;
  }

  async getDocumentsByCashOutcomeData(shopUuids: string[], since?: string, until?: string): Promise<Record<string, any>> {
    // CASH_OUTCOME is not tracked in sells table — return empty
    return {};
  }

  async getCashByShops(): Promise<Record<string, number>> {
    // Correct formula: last Z-report cash + cash sales after - cash outcomes after + paybacks after
    const fprints = await this.db.prepare(`
      SELECT f.store_uuid, f.store_name, f.cash, f.close_date as fprint_date
      FROM fprints f
      WHERE (f.store_uuid, f.close_date) IN (
        SELECT store_uuid, MAX(close_date) FROM fprints GROUP BY store_uuid
      )
    `).all<{ store_uuid: string; store_name: string; cash: number; fprint_date: string }>();

    const result: Record<string, number> = {};

    for (const fp of fprints.results) {
      const cashSales = await this.db.prepare(`
        SELECT CAST(COALESCE(SUM(p.sum), 0) AS DOUBLE) as val
        FROM payments p JOIN sells s ON p.doc_id = s.doc_id
        WHERE s.store_uuid = ? AND p.payment_type = 'CASH' AND s.close_date > ?
      `).bind(fp.store_uuid, fp.fprint_date).first<{ val: number }>();

      const cashOut = await this.db.prepare(`
        SELECT CAST(COALESCE(SUM(sum), 0) AS DOUBLE) as val
        FROM cash_outcomes WHERE store_uuid = ? AND close_date > ?
      `).bind(fp.store_uuid, fp.fprint_date).first<{ val: number }>();

      const paybacks = await this.db.prepare(`
        SELECT CAST(COALESCE(SUM(cash_returned), 0) AS DOUBLE) as val
        FROM paybacks WHERE store_uuid = ? AND close_date > ?
      `).bind(fp.store_uuid, fp.fprint_date).first<{ val: number }>();

      const balance = (fp.cash || 0)
        + (cashSales?.val || 0)
        - (cashOut?.val || 0)
        + (paybacks?.val || 0);

      const name = fp.store_name || fp.store_uuid;
      result[name] = Math.round(balance);
    }

    return result;
  }

  async getCashByShopsForPeriod(since: string, until: string): Promise<Record<string, number>> {
    // Same FPRINT-based formula as getCashByShops, but bounded by period end
    const fprints = await this.db.prepare(`
      SELECT f.store_uuid, f.store_name, f.cash, f.close_date as fprint_date
      FROM fprints f
      WHERE (f.store_uuid, f.close_date) IN (
        SELECT store_uuid, MAX(close_date) FROM fprints WHERE close_date < ? GROUP BY store_uuid
      )
    `).bind(until).all<{ store_uuid: string; store_name: string; cash: number; fprint_date: string }>();

    const result: Record<string, number> = {};

    for (const fp of fprints.results) {
      const cashSales = await this.db.prepare(`
        SELECT CAST(COALESCE(SUM(p.sum), 0) AS DOUBLE) as val
        FROM payments p JOIN sells s ON p.doc_id = s.doc_id
        WHERE s.store_uuid = ? AND p.payment_type = 'CASH'
          AND s.close_date > ? AND s.close_date < ?
      `).bind(fp.store_uuid, fp.fprint_date, until).first<{ val: number }>();

      const cashOut = await this.db.prepare(`
        SELECT CAST(COALESCE(SUM(sum), 0) AS DOUBLE) as val
        FROM cash_outcomes WHERE store_uuid = ? AND close_date > ? AND close_date < ?
      `).bind(fp.store_uuid, fp.fprint_date, until).first<{ val: number }>();

      const paybacks = await this.db.prepare(`
        SELECT CAST(COALESCE(SUM(cash_returned), 0) AS DOUBLE) as val
        FROM paybacks WHERE store_uuid = ? AND close_date > ? AND close_date < ?
      `).bind(fp.store_uuid, fp.fprint_date, until).first<{ val: number }>();

      const balance = (fp.cash || 0)
        + (cashSales?.val || 0)
        - (cashOut?.val || 0)
        + (paybacks?.val || 0);

      const name = fp.store_name || fp.store_uuid;
      result[name] = Math.round(balance);
    }

    return result;
  }

  async getExpensesByCategories(shopUuids: string[], since: string, until: string): Promise<Record<string, { byCategory: Record<string, number>; total: number }>> {
    // Expenses (CASH_OUTCOME) are not in sells/positions — they'd be in a separate table
    // For now return empty per-shop structure
    const names = await this.getShopNameUuidsDict() || {};
    const result: Record<string, { byCategory: Record<string, number>; total: number }> = {};
    for (const uuid of shopUuids) {
      const name = names[uuid] || uuid;
      result[name] = { byCategory: {}, total: 0 };
    }
    return result;
  }

  async getSalesgardenReportData(
    shopUuids: string[], since: string, until: string, db?: any
  ): Promise<{
    salesDataByShopName: Record<string, { sell: Record<string, number>; refund: Record<string, number>; totalSell: number }>;
    grandTotalSell: number;
    grandTotaRefund: number;
  }> {
    const salesDataByShopName: Record<string, { sell: Record<string, number>; refund: Record<string, number>; totalSell: number }> = {};
    let grandTotalSell = 0;

    for (const uuid of shopUuids) {
      const name = this.resolveName(uuid);
      const r = await this.db.prepare(`
        SELECT p.payment_type, SUM(p.sum) as total
        FROM payments p JOIN sells s ON p.doc_id = s.doc_id
        WHERE s.store_uuid = ? AND s.close_date >= ? AND s.close_date < ?
        GROUP BY p.payment_type
      `).bind(uuid, since, until).all<{ payment_type: string; total: number }>();

      const sell: Record<string, number> = {};
      let totalSell = 0;
      for (const row of r.results) {
        const label = row.payment_type === 'CASH' ? 'Наличными:' : row.payment_type === 'CARD' ? 'Банковской картой:' : row.payment_type;
        sell[label] = row.total;
        totalSell += row.total;
      }
      salesDataByShopName[name] = { sell, refund: {}, totalSell };
      grandTotalSell += totalSell;
    }

    return { salesDataByShopName, grandTotalSell, grandTotaRefund: 0 };
  }

  async getDocuments(shopUuid?: string, since?: string, until?: string): Promise<any[]> {
    let q = `SELECT doc_id, store_uuid, close_date FROM sells WHERE 1=1`;
    const params: any[] = [];
    if (shopUuid) { q += ` AND store_uuid = ?`; params.push(shopUuid); }
    if (since) { q += ` AND close_date >= ?`; params.push(since); }
    if (until) { q += ` AND close_date < ?`; params.push(until); }
    q += ` ORDER BY close_date DESC LIMIT 500`;

    const sells = await this.db.prepare(q).bind(...params).all<{ doc_id: string; store_uuid: string; close_date: string }>();
    const documents: any[] = [];

    for (const s of sells.results) {
      const positions = await this.db.prepare(`
        SELECT commodity_uuid, product_name, quantity, sum FROM positions WHERE doc_id = ?
      `).bind(s.doc_id).all<{ commodity_uuid: string; product_name: string; quantity: number; sum: number }>();

      documents.push({
        type: "SELL",
        closeDate: s.close_date,
        storeUuid: s.store_uuid,
        number: s.doc_id.slice(0, 8),
        transactions: positions.results.map(p => ({
          type: "REGISTER_POSITION",
          commodityUuid: p.commodity_uuid,
          commodityName: p.product_name,
          quantity: p.quantity,
          sum: p.sum,
        })),
      });
    }
    return documents;
  }

  async getDocumentsIndex(shopId: string, since: string, until: string): Promise<any[]> {
    const docs = await this.getDocuments(shopId, since, until);
    return docs.map(doc => ({
      closeDate: doc.closeDate,
      number: doc.number,
      openUserUuid: doc.openUserUuid ?? "",
      shop_id: doc.storeUuid ?? "",
      type: doc.type,
      transactions: doc.transactions ?? [],
    }));
  }

  async getDocumentsIndexForShops(queries: Array<{ shopId: string; since: string; until: string }>): Promise<any[]> {
    const results = await Promise.all(
      queries.map(q => this.getDocuments(q.shopId, q.since, q.until)
        .then(docs => docs.map(doc => ({
          closeDate: doc.closeDate,
          number: doc.number,
          openUserUuid: doc.openUserUuid ?? "",
          shop_id: doc.storeUuid ?? "",
          type: doc.type,
          transactions: doc.transactions ?? [],
        })))
        .catch(() => [] as any[])
      )
    );
    return results.flat();
  }
}

let _instance: DuckDBDataService | null = null;
export function getDataService(): DuckDBDataService {
  if (!_instance) _instance = new DuckDBDataService();
  return _instance;
}
