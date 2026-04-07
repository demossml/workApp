import http from "node:http";

const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";
const ALLOWED_HOST = "api.evotor.ru";
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 20000);
const MAX_ATTEMPTS = Number(process.env.UPSTREAM_MAX_ATTEMPTS || 3);

function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
	try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname !== "/proxy") {
      return json(res, 404, { ok: false, error: "NOT_FOUND" });
    }

    const target = url.searchParams.get("url") || "";
    if (!target) {
      return json(res, 400, { ok: false, error: "URL_REQUIRED" });
    }

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      return json(res, 400, { ok: false, error: "URL_INVALID" });
    }

    if (targetUrl.protocol !== "https:" || targetUrl.hostname !== ALLOWED_HOST) {
      return json(res, 403, { ok: false, error: "TARGET_NOT_ALLOWED" });
    }

    const upstreamHeaders = {};
    const auth = req.headers["x-authorization"];
    if (typeof auth === "string" && auth.length > 0) {
      upstreamHeaders["x-authorization"] = auth;
    }

    let response;
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
      try {
        response = await fetch(targetUrl.toString(), {
          method: "GET",
          headers: upstreamHeaders,
          signal: controller.signal,
        });
        clearTimeout(timer);
        break;
      } catch (error) {
        clearTimeout(timer);
        lastError = error;
        if (attempt >= MAX_ATTEMPTS) break;
        await new Promise((resolve) => setTimeout(resolve, attempt * 250));
      }
    }

    if (!response) {
      throw lastError || new Error("upstream unavailable");
    }

    const body = await response.text();
    const contentType = response.headers.get("content-type") || "application/json; charset=utf-8";

    res.writeHead(response.status, { "content-type": contentType });
    res.end(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    json(res, 500, { ok: false, error: "PROXY_FAILED", message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`evotor-proxy listening on ${HOST}:${PORT}`);
});
