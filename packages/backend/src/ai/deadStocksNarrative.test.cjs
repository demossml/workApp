const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");

const modulePath = path.resolve(__dirname, "./deadStocksNarrative.ts");

function loadWithNarrativeStub(generateNarrativeImpl) {
	const calls = { generateNarrative: 0 };
	const stubs = {
		"./client": {
			generateNarrative: async (input) => {
				calls.generateNarrative += 1;
				return generateNarrativeImpl(input);
			},
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
	return { ...loaded, calls };
}

test("buildDeadStocksNarrative returns null when items are empty", async () => {
	const { buildDeadStocksNarrative, calls } = loadWithNarrativeStub(async () => ({
		text: "should-not-be-called",
		fallbackUsed: false,
	}));

	const result = await buildDeadStocksNarrative({
		ai: {},
		items: [],
	});

	assert.deepEqual(result, { narrative: null, fallbackUsed: false });
	assert.equal(calls.generateNarrative, 0);
});

test("buildDeadStocksNarrative returns text when AI succeeds", async () => {
	const { buildDeadStocksNarrative } = loadWithNarrativeStub(async () => ({
		text: "Причины и действия",
		fallbackUsed: false,
	}));

	const result = await buildDeadStocksNarrative({
		ai: {},
		items: [{ name: "SKU A", quantity: 10, sold: 0, lastSaleDate: null }],
	});

	assert.equal(result.fallbackUsed, false);
	assert.equal(result.narrative, "Причины и действия");
});

test("buildDeadStocksNarrative suppresses technical fallback text", async () => {
	const { buildDeadStocksNarrative } = loadWithNarrativeStub(async () => ({
		text: "AI-недоступен...",
		fallbackUsed: true,
		error: "timeout",
	}));

	const result = await buildDeadStocksNarrative({
		ai: {},
		items: [{ name: "SKU B", quantity: 5, sold: 0, lastSaleDate: null }],
	});

	assert.deepEqual(result, { narrative: null, fallbackUsed: true });
});

