import crypto from "node:crypto";

const PASSWORD_ALGORITHM = "pbkdf2_sha256";
const PASSWORD_ITERATIONS = 210_000;
const PASSWORD_KEY_LENGTH = 32;
const TOKEN_ALGORITHM = "HS256";

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function sign(input, secret) {
  return crypto.createHmac("sha256", secret).update(input).digest("base64url");
}

export function hashPassword(password) {
  if (typeof password !== "string" || !password.length) {
    throw new Error("Password required.");
  }

  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto.pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, "sha256").toString("base64url");
  return `${PASSWORD_ALGORITHM}$${PASSWORD_ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(password, encoded) {
  const [algorithm, iterationValue, salt, storedHash] = String(encoded || "").split("$");
  const iterations = Number(iterationValue);
  if (algorithm !== PASSWORD_ALGORITHM || !Number.isFinite(iterations) || !salt || !storedHash) return false;

  const hash = crypto.pbkdf2Sync(password, salt, iterations, PASSWORD_KEY_LENGTH, "sha256").toString("base64url");
  return safeEqual(hash, storedHash);
}

export function createSessionToken(user, config) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: TOKEN_ALGORITHM, typ: "JWT" });
  const payload = base64UrlJson({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    iat: now,
    exp: now + config.auth.sessionTtlSeconds
  });
  const input = `${header}.${payload}`;
  return `${input}.${sign(input, config.auth.jwtSecret)}`;
}

export function verifySessionToken(token, config) {
  const [header, payload, signature] = String(token || "").split(".");
  if (!header || !payload || !signature) throw new Error("Invalid token.");

  const parsedHeader = JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
  if (parsedHeader.alg !== TOKEN_ALGORITHM) throw new Error("Invalid token algorithm.");

  const input = `${header}.${payload}`;
  if (!safeEqual(sign(input, config.auth.jwtSecret), signature)) throw new Error("Invalid token signature.");

  const parsedPayload = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (Number(parsedPayload.exp || 0) <= Math.floor(Date.now() / 1000)) throw new Error("Token expired.");
  return parsedPayload;
}
