const test = require("node:test");
const assert = require("node:assert/strict");

const { formatDeadStocksMessage } = require("./formatDeadStocksMessage.ts");

test("formatDeadStocksMessage includes AI block when narrative is provided", async () => {
	const evotor = {
		async getShopName(uuid) {
			if (uuid === "shop-main") return "Центральный";
			if (uuid === "shop-target") return "Западный";
			return "Неизвестный";
		},
	};

	const message = await formatDeadStocksMessage(
		evotor,
		"shop-main",
		[
			{
				name: "Liquid X",
				quantity: 12,
				sold: 0,
				lastSaleDate: "2026-03-10T10:00:00.000Z",
				mark: "move",
				moveCount: 4,
				moveToStore: "shop-target",
			},
		],
		"Причина: сезонный спад\nДействие: запустить акцию",
	);

	assert.match(message, /AI-анализ/);
	assert.match(message, /Причина: сезонный спад/);
	assert.match(message, /Магазин назначения: <b>Западный<\/b>/);
});

test("formatDeadStocksMessage omits AI block when narrative is missing", async () => {
	const evotor = {
		async getShopName() {
			return "Центральный";
		},
	};

	const message = await formatDeadStocksMessage(evotor, "shop-main", [
		{
			name: "Liquid Y",
			quantity: 3,
			sold: 0,
			lastSaleDate: null,
			mark: "sellout",
		},
	]);

	assert.doesNotMatch(message, /AI-анализ/);
	assert.match(message, /Liquid Y/);
});

