const test = require("node:test");
const assert = require("node:assert/strict");
const {
	computeAverageCheck,
	computeNetRevenue,
	computeRevenueSummary,
} = require("./revenueMath.ts");

test("computeNetRevenue subtracts refunds from gross revenue", () => {
	assert.equal(computeNetRevenue(37942, 7628), 30314);
});

test("computeAverageCheck returns 0 when checks count is zero", () => {
	assert.equal(computeAverageCheck(30314, 0), 0);
});

test("computeRevenueSummary returns consistent net revenue and average check", () => {
	const result = computeRevenueSummary(37942, 7628, 78);

	assert.equal(result.netRevenue, 30314);
	assert.equal(result.averageCheck, 30314 / 78);
});
