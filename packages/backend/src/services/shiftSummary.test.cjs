const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");

const modulePath = path.resolve(__dirname, "./shiftSummary.ts");

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

function loadServiceWithStubs({
	docs,
	planByShop,
	aiResult,
	subscriptions,
	employeeNamesByUuid,
}) {
	const calls = {
		savedSummary: null,
		sentMessages: [],
		touched: [],
	};

	const stubs = {
		"drizzle-orm/d1": {
			drizzle: () => ({ __drizzle: true }),
		},
		"./indexDocumentsFallback": {
			getDocumentsFromIndexFirst: async () => docs,
		},
		"../utils": {
			formatDateWithTime: (date, endOfDay) => {
				const suffix = endOfDay ? "23:59:59.000000+00:00" : "00:00:00.000000+00:00";
				return `${new Date(date).toISOString().slice(0, 10)}T${suffix}`;
			},
		},
		"../ai/client": {
			generateNarrative: async () => aiResult,
		},
		"../logger": {
			logger: { warn: () => {}, info: () => {}, error: () => {}, debug: () => {} },
		},
		"../db/repositories/tgSubscriptions": {
			listActiveTgSubscriptions: async () => subscriptions,
			touchTgSubscriptionLastSentAt: async (_db, userId, chatId) => {
				calls.touched.push({ userId, chatId });
			},
		},
		"../../utils/sendTelegramMessage": {
			sendTelegramMessage: async (chatId, text) => {
				calls.sentMessages.push({ chatId, text });
			},
		},
		"../db/repositories/plan": {
			getPlan: async () => planByShop,
		},
		"../db/repositories/aiHistory": {
			saveAiShiftSummary: async (_db, payload) => {
				calls.savedSummary = payload;
			},
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
	const { generateAndSendShiftSummary } = require(modulePath);
	Module._load = originalLoad;

	const evotor = {
		getShopName: async () => "Центральный",
		getEmployeeNamesByUuids: async () => employeeNamesByUuid,
	};
	const bindings = {
		DB: {},
		BOT_TOKEN: "test-token",
		AI_MODEL: "@cf/meta/llama-3.1-8b-instruct",
		AI_MAX_TOKENS: "900",
	};
	const ai = {};

	return { generateAndSendShiftSummary, calls, evotor, bindings, ai };
}

test("generateAndSendShiftSummary uses AI text and sends to subscribers", async () => {
	const docs = [
		{
			type: "SELL",
			openUserUuid: "emp-1",
			transactions: [{ type: "PAYMENT", sum: 1000 }],
		},
		{
			type: "PAYBACK",
			openUserUuid: "emp-1",
			transactions: [{ type: "PAYMENT", sum: 200 }],
		},
	];

	const { generateAndSendShiftSummary, calls, evotor, bindings, ai } =
		loadServiceWithStubs({
			docs,
			planByShop: { "shop-1": 3000 },
			aiResult: { text: "AI summary", fallbackUsed: false },
			subscriptions: [{ userId: "u1", chatId: "c1" }],
			employeeNamesByUuid: { "emp-1": "Иванов А." },
		});

	await withMockedDate("2026-03-21T12:00:00.000Z", async () => {
		await generateAndSendShiftSummary({
			bindings,
			evotor,
			ai,
			shopUuid: "shop-1",
		});
	});

	assert.equal(calls.savedSummary.shopUuid, "shop-1");
	assert.equal(calls.savedSummary.date, "2026-03-21");
	assert.equal(calls.savedSummary.summaryText, "AI summary");
	assert.equal(Math.round(calls.savedSummary.revenueActual), 800);
	assert.equal(Math.round(calls.savedSummary.revenuePlan), 3000);
	assert.equal(calls.savedSummary.topEmployee, "Иванов А.");

	assert.equal(calls.sentMessages.length, 1);
	assert.equal(calls.sentMessages[0].chatId, "c1");
	assert.match(calls.sentMessages[0].text, /AI summary/);
	assert.equal(calls.touched.length, 1);
});

test("generateAndSendShiftSummary falls back to deterministic text when AI fallback used", async () => {
	const docs = [
		{
			type: "SELL",
			openUserUuid: "emp-2",
			transactions: [{ type: "PAYMENT", sum: 500 }],
		},
	];

	const { generateAndSendShiftSummary, calls, evotor, bindings, ai } =
		loadServiceWithStubs({
			docs,
			planByShop: null,
			aiResult: { text: "fallback", fallbackUsed: true },
			subscriptions: [{ userId: "u2", chatId: "c2" }],
			employeeNamesByUuid: { "emp-2": "Петров Б." },
		});

	await withMockedDate("2026-03-21T12:00:00.000Z", async () => {
		await generateAndSendShiftSummary({
			bindings,
			evotor,
			ai,
			shopUuid: "shop-2",
		});
	});

	assert.equal(calls.savedSummary.shopUuid, "shop-2");
	assert.match(calls.savedSummary.summaryText, /Смена закрыта \(Центральный\)/);
	assert.equal(calls.sentMessages.length, 1);
	assert.match(calls.sentMessages[0].text, /Смена закрыта/);
});

