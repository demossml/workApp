const test = require("node:test");
const assert = require("node:assert/strict");
const {
	aggregateShopFinancialFromDocuments,
} = require("./financialAggregation.ts");

const paymentTypeLabels = {
	CARD: "Банковской картой:",
	CASH: "Нал. средствами:",
	UNKNOWN: "Неизвестно. По-умолчанию:",
};

test("SELL with negative PAYMENT (change) does not become refund", () => {
	const docs = [
		{
			type: "SELL",
			transactions: [
				{ type: "PAYMENT", paymentType: "CASH", sum: 1000 },
				{ type: "PAYMENT", paymentType: "CASH", sum: -200 },
			],
		},
	];

	const result = aggregateShopFinancialFromDocuments(docs, paymentTypeLabels);

	assert.equal(result.totalSell, 800);
	assert.equal(result.totalRefund, 0);
	assert.equal(result.sell["Нал. средствами:"], 800);
	assert.equal(Object.keys(result.refund).length, 0);
});

test("PAYBACK contributes only to refund totals", () => {
	const docs = [
		{
			type: "PAYBACK",
			transactions: [
				{ type: "PAYMENT", paymentType: "CARD", sum: 300 },
				{ type: "PAYMENT", paymentType: "CARD", sum: -50 },
			],
		},
	];

	const result = aggregateShopFinancialFromDocuments(docs, paymentTypeLabels);

	assert.equal(result.totalSell, 0);
	assert.equal(result.totalRefund, 350);
	assert.equal(result.refund["Банковской картой:"], 350);
});
