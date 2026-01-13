// types.ts

export type StoreOpeningStep = "initial" | "photos" | "cash_check";
export interface CashDiscrepancyData {
  amount: number | string;
  type: "+" | "-";
}
