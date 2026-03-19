import type { IndexDocument, Transaction } from "../evotor/types";

export type NormalizedReceipt = {
	id: string;
	number: string;
	shopId: string;
	closeDate: string;
	openUserUuid: string | null;
	type: string | null;
	total: number;
};

export type NormalizedPosition = {
	receiptId: string;
	shopId: string;
	closeDate: string;
	commodityUuid: string;
	commodityName: string | null;
	quantity: number;
	price: number;
	costPrice: number;
	sum: number;
};

export type NormalizedSets = {
	products: Map<string, string | null>;
	employees: Set<string>;
	stores: Set<string>;
	shopDates: Set<string>;
};

function buildReceiptId(shopId: string, number: string): string {
	return `${shopId}:${number}`;
}

function safeNumber(value: unknown): number {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

function getDateKey(closeDate: string): string | null {
	if (!closeDate) return null;
	const date = new Date(closeDate);
	if (Number.isNaN(date.getTime())) return null;
	const yyyy = date.getUTCFullYear();
	const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
	const dd = String(date.getUTCDate()).padStart(2, "0");
	return `${yyyy}-${mm}-${dd}`;
}

function isPayment(tx: Transaction): boolean {
	return tx?.type === "PAYMENT";
}

function isPosition(tx: Transaction): boolean {
	return tx?.type === "REGISTER_POSITION";
}

export function normalizeDocuments(
	documents: IndexDocument[],
): {
	receipts: NormalizedReceipt[];
	positions: NormalizedPosition[];
	sets: NormalizedSets;
} {
	const receipts: NormalizedReceipt[] = [];
	const positions: NormalizedPosition[] = [];
	const products = new Map<string, string | null>();
	const employees = new Set<string>();
	const stores = new Set<string>();
	const shopDates = new Set<string>();

	for (const doc of documents) {
		if (!doc?.shop_id || doc.number === undefined || doc.number === null) {
			continue;
		}
		if (!doc.closeDate) continue;

		const dateKey = getDateKey(doc.closeDate);
		if (dateKey) {
			shopDates.add(`${doc.shop_id}:${dateKey}`);
		}

		const receiptId = buildReceiptId(doc.shop_id, String(doc.number));
		const sign = doc.type === "PAYBACK" ? -1 : 1;

		let total = 0;
		for (const tx of doc.transactions || []) {
			if (!isPayment(tx)) continue;
			const sum = safeNumber(tx.sum);
			if (sum === 0) continue;
			// For SELL use signed payments (negative sums are change),
			// for PAYBACK use absolute to subtract the refund amount.
			const amount = sign === -1 ? Math.abs(sum) : sum;
			total += sign * amount;
		}

		receipts.push({
			id: receiptId,
			number: String(doc.number),
			shopId: doc.shop_id,
			closeDate: doc.closeDate,
			openUserUuid: doc.openUserUuid || null,
			type: doc.type ?? null,
			total,
		});

		if (doc.openUserUuid) {
			employees.add(doc.openUserUuid);
		}
		stores.add(doc.shop_id);

		for (const tx of doc.transactions || []) {
			if (!isPosition(tx)) continue;
			const commodityUuid = tx.commodityUuid;
			if (!commodityUuid) continue;
			const quantity = safeNumber(tx.quantity);
			const price = safeNumber(tx.price);
			const costPrice = safeNumber(tx.costPrice);
			const sum = safeNumber(tx.sum) || quantity * price;
			const signedQuantity = sign * quantity;
			const signedSum = sign * sum;

			positions.push({
				receiptId,
				shopId: doc.shop_id,
				closeDate: doc.closeDate,
				commodityUuid,
				commodityName: tx.commodityName || null,
				quantity: signedQuantity,
				price,
				costPrice,
				sum: signedSum,
			});

			if (commodityUuid) {
				if (!products.has(commodityUuid)) {
					products.set(commodityUuid, tx.commodityName || null);
				}
			}
		}
	}

	return {
		receipts,
		positions,
		sets: {
			products,
			employees,
			stores,
			shopDates,
		},
	};
}
