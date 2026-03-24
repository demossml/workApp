import { client } from "@shared/api";

const aiDirector = client.api.ai as any;

export async function fetchDirectorSummary(date: string) {
  const response = await aiDirector["director/summary"].$post({
    json: { date },
  });
  return response;
}

export async function fetchDirectorAlerts(date: string) {
  const response = await aiDirector["director/alerts"].$post({
    json: { date },
  });
  return response;
}

export async function fetchDirectorForecast(date: string) {
  const response = await aiDirector["director/forecast"].$post({
    json: { date },
  });
  return response;
}

export async function fetchDirectorVelocity(params: {
  since: string;
  until: string;
  limit?: number;
}) {
  const response = await aiDirector["director/velocity"].$post({
    json: {
      since: params.since,
      until: params.until,
      limit: params.limit ?? 50,
    },
  });
  return response;
}

export async function fetchDirectorRecommendations(params: {
  since: string;
  until: string;
  limit?: number;
}) {
  const response = await aiDirector["director/recommendations"].$post({
    json: {
      since: params.since,
      until: params.until,
      limit: params.limit ?? 50,
    },
  });
  return response;
}

export async function fetchDirectorReport(params: {
  date: string;
  sendTelegram?: boolean;
}) {
  const response = await aiDirector["director/report"].$post({
    json: {
      date: params.date,
      sendTelegram: Boolean(params.sendTelegram),
    },
  });
  return response;
}

export async function fetchOpeningPhotoDigest(date: string) {
  const response = await client.api.ai["opening-photo-digest"].$post({
    json: { date },
  });

  const json = (await response.json()) as {
    error?: string;
  } & Record<string, unknown>;

  if (!response.ok) {
    throw new Error(json.error || "Ошибка AI-анализа фото");
  }

  return json;
}
