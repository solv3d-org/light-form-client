export class HttpError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.details = details;
  }
}

export async function readJson(req) {
  if (req.method === "GET" || req.method === "HEAD") return {};

  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new HttpError(413, "Request body too large.");
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

export function sendJson(res, status, payload = null, headers = {}) {
  const body = payload == null ? "" : JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...headers
  });
  res.end(body);
}

export function sendError(res, error, headers = {}) {
  const status = error instanceof HttpError ? error.status : 500;
  sendJson(res, status, {
    error: {
      message: status === 500 ? "Internal server error." : error.message,
      details: error instanceof HttpError ? error.details : undefined
    }
  }, headers);
}

export function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

export function getCorsHeaders(req, config) {
  const allowed = String(config.corsOrigin || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const requestOrigin = req.headers.origin || "";
  const allowOrigin = allowed.includes("*") ? "*" : allowed.includes(requestOrigin) ? requestOrigin : allowed[0] || "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}
