const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");

const modulePath = path.resolve(__dirname, "./employeeKpiNarrative.ts");

const payload = {
	period: { startDate: "2026-03-20", endDate: "2026-03-21", days: 2 },
	overall: {
		revenue: 120000,
		checks: 85,
		avgCheck: 1411.76,
		returnRate: 2.4,
		marginPercent: 32.5,
	},
	topEmployees: [
		{
			employeeName: "Иванов А.",
			score: 84,
			avgCheck: 1600,
			returnRate: 1.2,
			reasons: ["Стабильные показатели"],
		},
	],
	problemEmployees: [
		{
			employeeName: "Петров Б.",
			score: 58,
			avgCheck: 980,
			returnRate: 6.8,
			reasons: ["Средний чек ниже среднего"],
		},
	],
	shiftSummary: [
		{
			shift: "morning",
			avgCheck: 1300,
			returnRate: 2.1,
			reasons: [],
		},
	],
};

function loadWithNarrativeStub(generateNarrativeImpl) {
	const stubs = {
		"./client": {
			generateNarrative: async (input) => generateNarrativeImpl(input),
		},
		"../logger": {
			logger: { warn: () => {}, info: () => {}, error: () => {}, debug: () => {} },
		},
	};

	const originalLoad = Module._load;
	Module._load = function patchedLoad(request, parent, isMain) {
		if (Object.prototype.hasOwnProperty.call(stubs, request)) {
			return stubs[request];
		}
		return originalLoad.call(this, request, parent, isMain);
	};

	delete require.cache[modulePath];
	const loaded = require(modulePath);
	Module._load = originalLoad;
	return loaded;
}

test("buildEmployeeKpiNarrative returns narrative text on AI success", async () => {
	const { buildEmployeeKpiNarrative } = loadWithNarrativeStub(async (input) => {
		assert.equal(input.temperature, 0.2);
		assert.equal(input.timeoutMs, 10_000);
		assert.deepEqual(input.data, payload);
		return { text: "Сильные стороны и план действий", fallbackUsed: false };
	});

	const result = await buildEmployeeKpiNarrative({
		ai: {},
		model: "@cf/meta/llama-3.1-8b-instruct",
		maxTokens: 700,
		data: payload,
	});

	assert.deepEqual(result, {
		narrative: "Сильные стороны и план действий",
		fallbackUsed: false,
	});
});

test("buildEmployeeKpiNarrative returns null narrative on fallback", async () => {
	const { buildEmployeeKpiNarrative } = loadWithNarrativeStub(async () => ({
		text: "AI-недоступен...",
		fallbackUsed: true,
		error: "timeout",
	}));

	const result = await buildEmployeeKpiNarrative({
		ai: {},
		data: payload,
	});

	assert.deepEqual(result, {
		narrative: null,
		fallbackUsed: true,
	});
});

