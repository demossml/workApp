import { client } from "@shared/api";

const aiDirector = client.api.ai as any;

export async function fetchDirectorOverview(params: {
  date: string;
  since: string;
  until: string;
  limit?: number;
}) {
  const response = await aiDirector["director/overview"].$post({
    json: {
      date: params.date,
      since: params.since,
      until: params.until,
      limit: params.limit ?? 50,
    },
  });

  const json = (await response.json()) as {
    date?: string;
    since?: string;
    until?: string;
    summary?: Record<string, unknown> | null;
    alerts?: Record<string, unknown> | null;
    forecast?: Record<string, unknown> | null;
    velocity?: Record<string, unknown> | null;
    recommendations?: Record<string, unknown> | null;
    report?: Record<string, unknown> | null;
    errors?: string[];
    error?: string;
  };

  if (!response.ok) {
    const reason =
      json.error ||
      (Array.isArray(json.errors) && json.errors.length > 0
        ? json.errors.join(" • ")
        : "Не удалось загрузить AI-обзор");
    throw new Error(reason);
  }

  return {
    date: json.date || params.date,
    since: json.since || params.since,
    until: json.until || params.until,
    summary: json.summary ?? null,
    alerts: json.alerts ?? null,
    forecast: json.forecast ?? null,
    velocity: json.velocity ?? null,
    recommendations: json.recommendations ?? null,
    report: json.report ?? null,
    errors: Array.isArray(json.errors) ? json.errors : [],
  };
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
