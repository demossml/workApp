import type { D1Database } from "@cloudflare/workers-types";

export interface OpenShopRecord {
	id: number;
	date: string;
	location_lat: number | null;
	location_lon: number | null;
	photoCashRegisterPhoto: string | null;
	photoСabinetsPhoto: string | null;
	photoShowcasePhoto1: string | null;
	photoShowcasePhoto2: string | null;
	photoShowcasePhoto3: string | null;
	photoTerritory1: string | null;
	photoTerritory2: string | null;
	countingMoney: number | null;
	CountingMoneyMessage: string | null;
	userId: string;
	shopUuid: string;
	dateTime: string;
}

export async function getData(
	date: string,
	shopUuid: string,
	db: D1Database,
): Promise<OpenShopRecord | null> {
	try {
		const query = `
		SELECT * 
		FROM openShops
		WHERE date = ? AND shopUuid = ?;
	  `;
		const statement = db.prepare(query);
		const result = await statement.bind(date, shopUuid).first();

		if (result) {
			return result as unknown as OpenShopRecord;
		}
		return null;
	} catch (err) {
		console.error(
			`Ошибка при извлечении данных для даты ${date} и магазина ${shopUuid}: ${err}`,
		);
		return null;
	}
}
