const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const { Hono } = require("hono");

const indexModulePath = path.resolve(__dirname, "./index.ts");

function createKv() {
	const storage = new Map();
	return {
		async get(key) {
			return storage.has(key) ? storage.get(key) : null;
		},
		async put(key, value) {
			storage.set(key, value);
		},
		async delete(key) {
			storage.delete(key);
		},
	};
}

async function withMockedDate(isoDate, run) {
	const RealDate = Date;
	class MockDate extends RealDate {
		constructor(...args) {
			if (args.length === 0) {
				super(isoDate);
				return;
			}
			super(...args);
		}

		static now() {
			return new RealDate(isoDate).getTime();
		}
	}

	global.Date = MockDate;
	try {
		await run();
	} finally {
		global.Date = RealDate;
	}
}

function loadWorkerWithStubs() {
	const calls = {
		digest: 0,
		tempo: 0,
		docs: 0,
		updateProducts: 0,
		updateProductsShope: 0,
		salary: 0,
		warns: [],
	};

	const stubs = {
		"./api": { api: new Hono() },
		"./helpers": {
			authenticate: async (_c, next) => next(),
			initialize: async (_c, next) => next(),
		},
		"./middleware": {
			errorHandler: (err, c) => c.json({ error: String(err) }, 500),
			requestLogger: () => async (_c, next) => next(),
		},
		"./routes/health": { healthRoutes: new Hono() },
		"./telegram/digestAndAlerts": {
			runDailyTelegramDigestAndAlerts: async () => {
				calls.digest += 1;
			},
		},
		"./telegram/tempoAlerts": {
			runTempoAlerts: async () => {
				calls.tempo += 1;
			},
		},
		"./jobs/evotrackIndexing": {
			getDataForCurrentDate: async () => {
				calls.salary += 1;
			},
			getDocuments: async () => {
				calls.docs += 1;
			},
			updateProducts: async () => {
				calls.updateProducts += 1;
			},
			updateProductsShope: async () => {
				calls.updateProductsShope += 1;
			},
		},
		"./logger": {
			logger: {
				warn: (message, payload) => {
					calls.warns.push({ message, payload });
				},
				error: () => {},
				info: () => {},
			},
		},
	};

	const originalLoad = Module._load;
	Module._load = function patchedLoader(request, parent, isMain) {
		if (Object.prototype.hasOwnProperty.call(stubs, request)) {
			return stubs[request];
		}
		return originalLoad.call(this, request, parent, isMain);
	};

	delete require.cache[indexModulePath];
	const worker = require(indexModulePath).default;

	Module._load = originalLoad;
	return { worker, calls };
}

test("scheduled */3 calls documents indexing on every run", async () => {
	const { worker, calls } = loadWorkerWithStubs();
	const env = { ALERT_TZ_OFFSET_MINUTES: "180" };

	await withMockedDate("2026-03-21T05:12:00.000Z", async () => {
		await worker.scheduled({ cron: "*/3 * * * *" }, env);
	});

	assert.equal(calls.docs, 1);
	assert.equal(calls.updateProducts, 0);
	assert.equal(calls.updateProductsShope, 0);
	assert.equal(calls.salary, 0);
	assert.equal(calls.digest, 0);
});

test("scheduled */3 runs evotrack interval jobs and deduplicates by KV", async () => {
	const { worker, calls } = loadWorkerWithStubs();
	const env = { ALERT_TZ_OFFSET_MINUTES: "180", KV: createKv() };

	await withMockedDate("2026-03-21T03:36:00.000Z", async () => {
		await worker.scheduled({ cron: "*/3 * * * *" }, env);
		await worker.scheduled({ cron: "*/3 * * * *" }, env);
	});

	assert.equal(calls.docs, 2);
	assert.equal(calls.updateProductsShope, 1);
	assert.equal(calls.updateProducts, 1);
	assert.equal(calls.salary, 1);
	assert.equal(calls.digest, 0);
});

test("scheduled 0 8 and 0 11 trigger tempo alerts", async () => {
	const { worker, calls } = loadWorkerWithStubs();
	const env = {};

	await worker.scheduled({ cron: "0 8 * * *" }, env);
	await worker.scheduled({ cron: "0 11 * * *" }, env);

	assert.equal(calls.tempo, 2);
});

test("scheduled unknown cron writes warning", async () => {
	const { worker, calls } = loadWorkerWithStubs();
	const env = {};

	await worker.scheduled({ cron: "13 13 * * *" }, env);

	assert.equal(calls.warns.length, 1);
	assert.equal(calls.warns[0].message, "Unhandled scheduled cron expression");
	assert.equal(calls.warns[0].payload.cron, "13 13 * * *");
});

