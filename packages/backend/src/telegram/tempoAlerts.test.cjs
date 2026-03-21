const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");

const modulePath = path.resolve(__dirname, "./tempoAlerts.ts");

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

function loadTempoAlertsWithStubs({
	subscriptions,
	shopUuids,
	shopNamesMap,
	openings = [],
	planByShop,
	docsByShop,
	aiNarrative = { text: "", fallbackUsed: true },
}) {
	const calls = {
		send: [],
		touch: [],
		saveAlert: [],
	};

	class EvotorStub {
		async getShopUuids() {
			return shopUuids;
		}
		async getShopNamesByUuids() {
			return shopNamesMap;
		}
	}

	const stubs = {
		"drizzle-orm/d1": {
			drizzle: () => ({ __drizzle: true }),
		},
		"../evotor": {
			Evotor: EvotorStub,
		},
		"../services/indexDocumentsFallback": {
			getDocumentsFromIndexFirst: async (_db, _evo, shopUuid) =>
				docsByShop[shopUuid] || [],
		},
		"../db/repositories/openStores": {
			getOpeningsByDate: async () => openings,
		},
		"../db/repositories/plan": {
			getPlan: async () => planByShop,
		},
		"../db/repositories/tgSubscriptions": {
			listActiveTgSubscriptions: async () => subscriptions,
			touchTgSubscriptionLastSentAt: async (_db, userId, chatId) => {
				calls.touch.push({ userId, chatId });
			},
		},
		"../../utils/sendTelegramMessage": {
			sendTelegramMessage: async (chatId, text) => {
				calls.send.push({ chatId, text });
			},
		},
		"../logger": {
			logger: { warn: () => {}, info: () => {}, error: () => {}, debug: () => {} },
		},
		"../ai/client": {
			generateNarrative: async () => aiNarrative,
		},
		"../db/repositories/aiHistory": {
			saveAiAlert: async (_db, payload) => {
				calls.saveAlert.push(payload);
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
	const { runTempoAlerts } = require(modulePath);
	Module._load = originalLoad;

	return { runTempoAlerts, calls };
}

test("runTempoAlerts sends and persists alerts when forecast is below threshold", async () => {
	const { runTempoAlerts, calls } = loadTempoAlertsWithStubs({
		subscriptions: [{ userId: "u1", chatId: "chat-1" }],
		shopUuids: ["shop-1"],
		shopNamesMap: { "shop-1": "Центральный" },
		planByShop: { "shop-1": 1000 },
		docsByShop: {
			"shop-1": [
				{
					type: "SELL",
					transactions: [{ type: "PAYMENT", sum: 100 }],
				},
			],
		},
		aiNarrative: {
			text: "1) Ускорить допродажи\n2) Подсветить промо\n3) Контроль скриптов",
			fallbackUsed: false,
		},
	});

	const bindings = {
		DB: {},
		KV: undefined,
		EVOTOR_API_TOKEN: "token",
		BOT_TOKEN: "bot",
		ALERT_THRESHOLD_PCT: "80",
		AI: {},
		AI_MODEL: "@cf/meta/llama-3.1-8b-instruct",
		AI_MAX_TOKENS: "500",
	};

	await withMockedDate("2026-03-21T08:00:00.000Z", async () => {
		await runTempoAlerts(bindings);
	});

	assert.equal(calls.saveAlert.length, 1);
	assert.equal(calls.saveAlert[0].shopUuid, "shop-1");
	assert.equal(calls.saveAlert[0].alertType, "tempo_alert");
	assert.equal(calls.saveAlert[0].severity, "warning");

	assert.equal(calls.send.length, 1);
	assert.equal(calls.send[0].chatId, "chat-1");
	assert.match(calls.send[0].text, /Центральный/);
	assert.match(calls.send[0].text, /Алерт темпа/);
	assert.equal(calls.touch.length, 1);
});

test("runTempoAlerts skips send when forecast is above threshold", async () => {
	const { runTempoAlerts, calls } = loadTempoAlertsWithStubs({
		subscriptions: [{ userId: "u1", chatId: "chat-1" }],
		shopUuids: ["shop-1"],
		shopNamesMap: { "shop-1": "Центральный" },
		planByShop: { "shop-1": 1000 },
		docsByShop: {
			"shop-1": [
				{
					type: "SELL",
					transactions: [{ type: "PAYMENT", sum: 3000 }],
				},
			],
		},
	});

	const bindings = {
		DB: {},
		KV: undefined,
		EVOTOR_API_TOKEN: "token",
		BOT_TOKEN: "bot",
		ALERT_THRESHOLD_PCT: "80",
		AI: {},
		AI_MODEL: "@cf/meta/llama-3.1-8b-instruct",
		AI_MAX_TOKENS: "500",
	};

	await withMockedDate("2026-03-21T08:00:00.000Z", async () => {
		await runTempoAlerts(bindings);
	});

	assert.equal(calls.saveAlert.length, 0);
	assert.equal(calls.send.length, 0);
	assert.equal(calls.touch.length, 0);
});

