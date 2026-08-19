import { createAuth } from "./auth";
import { isEmptyPayload, readApplePayload, suppliedFields } from "./domain/appleHealth";
import type { Env } from "./env";

const MAX_PAYLOAD_BYTES = 750_000;
const MAX_HEALTH_PAYLOAD_BYTES = 12_000;
const MAX_MECHANICS_VIDEO_BYTES = 95_000_000;
const MAX_MEAL_PHOTO_BYTES = 20_000_000;
const MAX_MECHANICS_CONTACT_SHEET_BYTES = 5_000_000;
const MAX_HISTORY_REQUEST_BYTES = 1_000_000;
const MAX_HISTORY_EVENT_BYTES = 250_000;
const MAX_NUTRITION_TEXT_BYTES = 8_000;
const MAX_SHARE_PAYLOAD_BYTES = 400_000;
const SHARE_LIFETIME_DAYS = 90;

const SYNC_KEY_PATTERN = /^[a-f0-9]{64}$/i;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MEDIA_ID_PATTERN = /^[a-zA-Z0-9_-]{12,80}$/;
const SHARE_ID_PATTERN = /^[a-f0-9]{32}$/;

const HISTORY_EVENT_TYPES = new Set([
  "plan_snapshot",
  "health_check_in",
  "task_completion",
  "session_check_out",
  "performance_result",
  "plan_change",
]);

const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MEAL_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const OURA_AUTHORIZE_URL = "https://cloud.ouraring.com/oauth/authorize";
const OURA_TOKEN_URL = "https://api.ouraring.com/oauth/token";
const OURA_API_BASE = "https://api.ouraring.com/v2/usercollection";
const OURA_SCOPE =
  "daily email personal heartrate tag workout session spo2 ring_configuration stress heart_health";
const OAUTH_STATE_LIFETIME_MS = 10 * 60 * 1000;
const OURA_CACHE_MS = 30 * 60 * 1000;

const API_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  // API responses are JSON and should never be treated as a document, framed,
  // or loaded over plaintext. Static assets get their equivalents from
  // public/_headers; these responses are built in code, so they need their own.
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Resource-Policy": "same-origin",
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: API_HEADERS });
}

function redirectToIntegration(origin: string, status: string): Response {
  // `/next/` rather than `/`: that is the app the athlete lands in now, and a
  // redirect to `/` would only bounce here anyway.
  return Response.redirect(`${origin}/next/?page=integrations&oura=${encodeURIComponent(status)}`, 302);
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization") || "";
  const match = /^Bearer\s+([a-f0-9]{64})$/i.exec(header);
  return match?.[1]?.toLowerCase() || null;
}

function applicationOrigin(env: Env, url: URL): string {
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return url.origin;
  try {
    return new URL(env.APP_ORIGIN).origin;
  } catch {
    throw new Error("APP_ORIGIN is not configured");
  }
}

function requireSameOrigin(request: Request, url: URL, env: Env): Response | null {
  const origin = request.headers.get("Origin");
  return origin && origin !== applicationOrigin(env, url)
    ? json({ error: "Cross-origin request blocked" }, 403)
    : null;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function recoveryKeyHash(request: Request): Promise<string | null> {
  const token = bearerToken(request);
  return token ? sha256Hex(`pitching-os-sync-v1:${token}`) : null;
}

async function nutritionKeyHash(request: Request, env: Env, url: URL): Promise<string | null> {
  const recoveryHash = await recoveryKeyHash(request);
  if (recoveryHash) return recoveryHash;
  try {
    const session = await accountSession(request, env, url);
    if (!session?.user?.id) return null;
    const workspace = await env.SYNC_DB.prepare(
      "SELECT key_hash FROM account_workspaces WHERE user_id = ?1"
    )
      .bind(session.user.id)
      .first<{ key_hash: string }>();
    return workspace?.key_hash || null;
  } catch {
    return null;
  }
}

async function enforceAccountRateLimit(
  request: Request,
  env: Env,
  url: URL,
  limiter: RateLimit,
  category: string
): Promise<Response | null> {
  const keyHash = await nutritionKeyHash(request, env, url);
  // Security fix: this previously returned null (= allow) whenever the request
  // wasn't attributable to an account, so unauthenticated callers skipped rate
  // limiting entirely and could hammer these endpoints — and the session/D1
  // lookups behind them — without bound. Fall back to the caller's IP instead.
  const key = keyHash
    ? `${category}:${keyHash}`
    : `${category}:ip:${clientIp(request)}`;
  const tooMany = json({ error: "Too many requests. Wait a minute and try again." }, 429);

  const outcome = await limiter.limit({ key });
  if (!outcome.success) return tooMany;

  // The binding's production behaviour is unverified — see `overLimit`. These
  // are the endpoints that spend money per call, so the count that can be
  // demonstrated is the one in D1.
  const { limit, period } =
    limiter === env.INTEGRATION_RATE_LIMITER ? LIMITS.integration : LIMITS.ai;
  return (await overLimit(env, key, limit, period)) ? tooMany : null;
}

function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

// The Apple Health ingest endpoint is the one route reachable from outside the
// browser (by design — an iPhone Shortcut posts to it with a bearer token), and
// it previously had no rate limiting at all. Bound it by IP first so token
// guessing and unauthenticated floods are capped regardless, then by the
// presented token so a single compromised Shortcut can't flood either.
/**
 * Count a request against a fixed window in D1, and say whether it is over.
 *
 * The Workers Rate Limiting binding is configured the documented way and
 * enforces exactly as specified under `wrangler dev`. Whether it enforces in
 * production is still unproven: the tests that concluded it did not — 90
 * sequential requests to a 60-per-minute endpoint returning zero 429s — were
 * invalid. Each request took about 1.4 seconds, so 90 of them spanned more
 * than two 60-second windows and at most ~42 ever landed in one. The limit
 * could not have been reached. Fired as a parallel burst instead, the same
 * endpoint refuses. So the binding is not known to be broken; it is only not
 * known to work, and Cloudflare gives it no visibility to check.
 *
 * This exists because a limit nobody can demonstrate is not protection, and
 * the endpoints behind these ones spend money per call. One row per key per
 * window, in a database this Worker already has, verifiable from either side.
 * The binding is still called first: it is cheaper, it works at the edge, and
 * if it does enforce it does so before this runs.
 *
 * Under a burst this refuses slightly early — concurrent requests each
 * increment before reading, so a caller can see a count inflated by requests
 * still in flight. Erring towards refusing is the right direction for a
 * limiter, and the increment itself is atomic, so the count never drifts low.
 *
 * Fails open. If D1 is unavailable the request is allowed rather than the app
 * being taken down by its own rate limiter — the failure mode of a broken
 * limiter must not be worse than the abuse it prevents.
 */
async function overLimit(
  env: Env,
  key: string,
  limit: number,
  periodSeconds: number
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % periodSeconds);
  // Two statements rather than one INSERT ... RETURNING. The single-statement
  // form works under wrangler dev but returns no row from the deployed D1, so
  // the count read back was always zero and nothing was ever over the limit —
  // a limiter that looked like it worked and silently allowed everything. The
  // read-back is a separate SELECT because it has to be right, not clever.
  const count = async (): Promise<number> => {
    await env.SYNC_DB.prepare(
      `INSERT INTO rate_limits (bucket, window_start, hits) VALUES (?1, ?2, 1)
       ON CONFLICT(bucket, window_start) DO UPDATE SET hits = hits + 1`
    )
      .bind(key, windowStart)
      .run();
    const row = await env.SYNC_DB.prepare(
      "SELECT hits FROM rate_limits WHERE bucket = ?1 AND window_start = ?2"
    )
      .bind(key, windowStart)
      .first<{ hits: number }>();
    return Number(row?.hits ?? 0);
  };

  try {
    let hits: number;
    try {
      hits = await count();
    } catch (cause) {
      // The table is created here rather than only in migrations/ because the
      // credentials that deploy this Worker cannot run D1 migrations, so a
      // deploy would otherwise ship a limiter that silently fails open until
      // someone remembered to run one. It is additive and idempotent, it runs
      // once per database, and the alternative is protection that depends on
      // a manual step.
      if (!/no such table/i.test(String(cause))) throw cause;
      await env.SYNC_DB.prepare(
        `CREATE TABLE IF NOT EXISTS rate_limits (
           bucket TEXT NOT NULL,
           window_start INTEGER NOT NULL,
           hits INTEGER NOT NULL DEFAULT 1,
           PRIMARY KEY (bucket, window_start)
         ) STRICT`
      ).run();
      await env.SYNC_DB.prepare(
        "CREATE INDEX IF NOT EXISTS rate_limits_window_idx ON rate_limits (window_start)"
      ).run();
      hits = await count();
    }

    // A count that cannot be read back is a limiter that cannot limit. Say so
    // rather than letting it look like everything is under the limit.
    if (hits === 0) {
      console.error(JSON.stringify({ message: "rate limit count unreadable", key }));
      return false;
    }

    // Sweep closed windows occasionally rather than on a schedule, so the
    // table cannot grow without bound and nothing has to be remembered.
    if (hits === 1 && Math.random() < 0.02) {
      await env.SYNC_DB.prepare("DELETE FROM rate_limits WHERE window_start < ?1")
        .bind(windowStart - periodSeconds * 4)
        .run();
    }
    return hits > limit;
  } catch (error) {
    console.error(
      JSON.stringify({ message: "rate limit check failed", key, error: String(error) })
    );
    return false;
  }
}

/** Limits, in one place, so the call sites and the tests agree. */
const LIMITS = {
  ai: { limit: 20, period: 60 },
  integration: { limit: 10, period: 60 },
  ingest: { limit: 60, period: 60 },
} as const;

async function enforceIngestRateLimit(request: Request, env: Env): Promise<Response | null> {
  const tooMany = json({ error: "Too many requests. Wait a minute and try again." }, 429);
  const { limit, period } = LIMITS.ingest;

  const ipKey = `apple-ingest:ip:${clientIp(request)}`;
  const byIp = await env.INGEST_RATE_LIMITER.limit({ key: ipKey });
  if (!byIp.success) return tooMany;
  if (await overLimit(env, ipKey, limit, period)) return tooMany;

  const token = bearerToken(request);
  if (!token) return null;
  const tokenKey = `apple-ingest:token:${await sha256Hex(`pitching-os-apple-health-v1:${token}`)}`;
  const byToken = await env.INGEST_RATE_LIMITER.limit({ key: tokenKey });
  if (!byToken.success) return tooMany;
  return (await overLimit(env, tokenKey, limit, period)) ? tooMany : null;
}

function randomHex(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value || "").trim().slice(0, maxLength);
}

function citedUrls(value: unknown, depth = 0): string[] {
  if (depth > 6 || value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap((item) => citedUrls(item, depth + 1));
  if (typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const direct = typeof record.url === "string" && /^https:\/\//i.test(record.url) ? [record.url] : [];
  return [...direct, ...Object.values(record).flatMap((item) => citedUrls(item, depth + 1))];
}

function comparableUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

// -- Symmetric crypto helpers (AES-GCM) for at-rest secrets --------------

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 16384) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 16384));
  }
  return btoa(binary);
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function hexToBytes(value: string): Uint8Array {
  if (!SYNC_KEY_PATTERN.test(value)) throw new Error("Encryption key is not configured correctly");
  return Uint8Array.from(value.match(/.{2}/g) || [], (pair) => Number.parseInt(pair, 16));
}

async function encryptionKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", bytesToArrayBuffer(hexToBytes(secret)), { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function encryptSecret(value: string, env: Env): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey(env.HEALTH_TOKEN_KEY);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(ciphertext))}`;
}

async function decryptSecret(value: string, env: Env): Promise<string> {
  const [version, ivValue, ciphertextValue] = value.split(".");
  if (version !== "v1" || !ivValue || !ciphertextValue) throw new Error("Unsupported encrypted health token");
  const key = await encryptionKey(env.HEALTH_TOKEN_KEY);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytesToArrayBuffer(base64UrlToBytes(ivValue)) },
    key,
    bytesToArrayBuffer(base64UrlToBytes(ciphertextValue))
  );
  return new TextDecoder().decode(plaintext);
}

async function wrapWorkspaceKey(value: string, env: Env): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey(env.WORKSPACE_MASTER_KEY);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(ciphertext))}`;
}

async function unwrapWorkspaceKey(value: string, env: Env): Promise<string> {
  const [version, ivValue, ciphertextValue] = value.split(".");
  if (version !== "v1" || !ivValue || !ciphertextValue) throw new Error("Unsupported encrypted workspace key");
  const key = await encryptionKey(env.WORKSPACE_MASTER_KEY);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytesToArrayBuffer(base64UrlToBytes(ivValue)) },
    key,
    bytesToArrayBuffer(base64UrlToBytes(ciphertextValue))
  );
  const result = new TextDecoder().decode(plaintext);
  if (!SYNC_KEY_PATTERN.test(result)) throw new Error("Workspace key is invalid");
  return result.toLowerCase();
}

// -- Signed, time-limited private media URLs -----------------------------

async function mediaSignature(id: string, keyHash: string, expires: number, env: Env): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    bytesToArrayBuffer(hexToBytes(env.HEALTH_TOKEN_KEY)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}:${keyHash}:${expires}`));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function privateMediaUrl(path: string, id: string, keyHash: string, env: Env): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + 15 * 60;
  const signature = await mediaSignature(id, keyHash, expires, env);
  return `${path}?expires=${expires}&signature=${encodeURIComponent(signature)}`;
}

async function validMediaSignature(url: URL, id: string, keyHash: string, env: Env): Promise<boolean> {
  const expires = Number(url.searchParams.get("expires"));
  const supplied = url.searchParams.get("signature") || "";
  if (!Number.isInteger(expires) || expires < Math.floor(Date.now() / 1000) || expires > Math.floor(Date.now() / 1000) + 20 * 60) {
    return false;
  }
  const expected = await mediaSignature(id, keyHash, expires, env);
  if (supplied.length !== expected.length) return false;
  const suppliedBytes = new TextEncoder().encode(supplied);
  const expectedBytes = new TextEncoder().encode(expected);
  let difference = 0;
  for (let index = 0; index < suppliedBytes.length; index += 1) difference |= suppliedBytes[index] ^ expectedBytes[index];
  return difference === 0;
}

// -- Validation helpers ----------------------------------------------------

function isOuraTokenReply(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSyncBody(value: unknown): value is { payload: string; expectedRevision: number } {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return (
    typeof body.payload === "string" &&
    body.payload.length >= 16 &&
    body.payload.length <= MAX_PAYLOAD_BYTES &&
    Number.isInteger(body.expectedRevision) &&
    Number(body.expectedRevision) >= 0
  );
}

function validDay(value: unknown): value is string {
  if (!value || typeof value !== "string" || !DAY_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

interface TrainingHistoryEvent {
  id: string;
  eventType: string;
  sessionDay: string;
  occurredAt: string;
  encryptedPayload: string;
}

function isTrainingHistoryInput(value: unknown): value is TrainingHistoryEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.id === "string" &&
    MEDIA_ID_PATTERN.test(event.id) &&
    typeof event.eventType === "string" &&
    HISTORY_EVENT_TYPES.has(event.eventType) &&
    typeof event.sessionDay === "string" &&
    validDay(event.sessionDay) &&
    typeof event.occurredAt === "string" &&
    Number.isFinite(Date.parse(event.occurredAt)) &&
    typeof event.encryptedPayload === "string" &&
    event.encryptedPayload.length >= 32 &&
    event.encryptedPayload.length <= MAX_HISTORY_EVENT_BYTES
  );
}

function isTrainingHistoryBody(value: unknown): value is { events: TrainingHistoryEvent[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const events = (value as Record<string, unknown>).events;
  return Array.isArray(events) && events.length >= 1 && events.length <= 50 && events.every(isTrainingHistoryInput);
}

function addUtcDays(day: string, amount: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function finiteNumber(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= min && numeric <= max ? numeric : null;
}

function isOuraConfigured(env: Env): boolean {
  return Boolean(env.OURA_CLIENT_ID && env.OURA_CLIENT_SECRET && env.HEALTH_TOKEN_KEY && env.OURA_CLIENT_ID !== "local-type-placeholder");
}

function privateMediaBucket(env: Env): R2Bucket {
  return env.PRIVATE_MEDIA;
}

// -- Cloud sync (encrypted client-side blob) --------------------------------

async function handleSync(request: Request, env: Env): Promise<Response> {
  const token = bearerToken(request);
  if (!token || !SYNC_KEY_PATTERN.test(token)) return json({ error: "Invalid recovery key" }, 401);
  const keyHash = await sha256Hex(`pitching-os-sync-v1:${token}`);

  if (request.method === "GET") {
    const row = await env.SYNC_DB.prepare(
      "SELECT payload, revision, updated_at FROM sync_snapshots WHERE key_hash = ?1"
    )
      .bind(keyHash)
      .first<{ payload: string; revision: number; updated_at: string }>();
    return row
      ? json({ found: true, payload: row.payload, revision: row.revision, updatedAt: row.updated_at })
      : json({ found: false, revision: 0 });
  }

  if (request.method === "PUT") {
    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength > MAX_PAYLOAD_BYTES + 10_000) return json({ error: "Sync payload is too large" }, 413);
    const body = await request.json().catch(() => null);
    if (!isSyncBody(body)) return json({ error: "Invalid sync payload" }, 400);
    const now = new Date().toISOString();

    const write =
      body.expectedRevision === 0
        ? await env.SYNC_DB.prepare(
            `INSERT INTO sync_snapshots (key_hash, payload, revision, updated_at, created_at)
             VALUES (?1, ?2, 1, ?3, ?3)
             ON CONFLICT(key_hash) DO NOTHING`
          )
            .bind(keyHash, body.payload, now)
            .run()
        : await env.SYNC_DB.prepare(
            `UPDATE sync_snapshots
             SET payload = ?1, revision = revision + 1, updated_at = ?2
             WHERE key_hash = ?3 AND revision = ?4`
          )
            .bind(body.payload, now, keyHash, body.expectedRevision)
            .run();

    if (Number(write.meta.changes || 0) !== 1) {
      const current = await env.SYNC_DB.prepare(
        "SELECT revision, updated_at FROM sync_snapshots WHERE key_hash = ?1"
      )
        .bind(keyHash)
        .first<{ revision: number; updated_at: string }>();
      return json(
        {
          error: "A newer encrypted save exists. Merge and retry.",
          code: "sync_conflict",
          currentRevision: current?.revision || 0,
          updatedAt: current?.updated_at || "",
        },
        409
      );
    }

    const row = await env.SYNC_DB.prepare(
      "SELECT revision, updated_at FROM sync_snapshots WHERE key_hash = ?1"
    )
      .bind(keyHash)
      .first<{ revision: number; updated_at: string }>();
    return json({ saved: true, revision: row?.revision || 1, updatedAt: row?.updated_at || now });
  }

  if (request.method === "DELETE") {
    const mediaRows = await env.SYNC_DB.prepare(
      `SELECT object_key FROM mechanics_videos WHERE key_hash = ?1
       UNION ALL
       SELECT object_key FROM meal_photos WHERE key_hash = ?1`
    )
      .bind(keyHash)
      .all<{ object_key: string }>();
    const mediaBucket = privateMediaBucket(env);
    if (mediaRows.results?.length && mediaBucket) {
      await mediaBucket.delete(mediaRows.results.map((row) => row.object_key));
    }
    await env.SYNC_DB.batch([
      env.SYNC_DB.prepare("DELETE FROM sync_snapshots WHERE key_hash = ?1").bind(keyHash),
      env.SYNC_DB.prepare("DELETE FROM oauth_states WHERE key_hash = ?1").bind(keyHash),
      env.SYNC_DB.prepare("DELETE FROM oauth_connections WHERE key_hash = ?1").bind(keyHash),
      env.SYNC_DB.prepare("DELETE FROM apple_health_connections WHERE key_hash = ?1").bind(keyHash),
      env.SYNC_DB.prepare("DELETE FROM health_daily WHERE key_hash = ?1").bind(keyHash),
      env.SYNC_DB.prepare("DELETE FROM training_history_events WHERE key_hash = ?1").bind(keyHash),
      env.SYNC_DB.prepare("DELETE FROM mechanics_videos WHERE key_hash = ?1").bind(keyHash),
      env.SYNC_DB.prepare("DELETE FROM meal_photos WHERE key_hash = ?1").bind(keyHash),
      // A revoked workspace must not leave a live physio link behind it.
      env.SYNC_DB.prepare("DELETE FROM physio_shares WHERE key_hash = ?1").bind(keyHash),
    ]);
    return json({ deleted: true });
  }

  return json({ error: "Method not allowed" }, 405);
}

async function handleTrainingHistory(request: Request, env: Env, url: URL): Promise<Response> {
  const keyHash = await recoveryKeyHash(request);
  if (!keyHash) return json({ error: "Cloud autosave recovery key required" }, 401);

  if (request.method === "GET") {
    const start = url.searchParams.get("start") || "2000-01-01";
    const end = url.searchParams.get("end") || "2100-12-31";
    const limit = Math.min(2000, Math.max(1, Math.floor(Number(url.searchParams.get("limit")) || 500)));
    const after = url.searchParams.get("after") || "";
    const afterId = url.searchParams.get("afterId") || "";

    if (!validDay(start) || !validDay(end) || start > end) {
      return json({ error: "History dates are invalid" }, 400);
    }
    if ((after && !Number.isFinite(Date.parse(after))) || (afterId && !MEDIA_ID_PATTERN.test(afterId))) {
      return json({ error: "History cursor is invalid" }, 400);
    }
    if (Boolean(after) !== Boolean(afterId)) return json({ error: "History cursor is incomplete" }, 400);

    type HistoryRow = {
      id: string;
      event_type: string;
      session_day: string;
      occurred_at: string;
      encrypted_payload: string;
      created_at: string;
    };

    const rows = after
      ? await env.SYNC_DB.prepare(
          `SELECT id, event_type, session_day, occurred_at, encrypted_payload, created_at
           FROM training_history_events
           WHERE key_hash = ?1 AND session_day BETWEEN ?2 AND ?3
             AND (occurred_at > ?4 OR (occurred_at = ?4 AND id > ?5))
           ORDER BY occurred_at ASC, id ASC
           LIMIT ?6`
        )
          .bind(keyHash, start, end, after, afterId, limit)
          .all<HistoryRow>()
      : await env.SYNC_DB.prepare(
          `SELECT id, event_type, session_day, occurred_at, encrypted_payload, created_at
           FROM training_history_events
           WHERE key_hash = ?1 AND session_day BETWEEN ?2 AND ?3
           ORDER BY occurred_at ASC, id ASC
           LIMIT ?4`
        )
          .bind(keyHash, start, end, limit)
          .all<HistoryRow>();

    const last = rows.results?.at(-1);
    return json({
      events: (rows.results || []).map((row) => ({
        id: row.id,
        eventType: row.event_type,
        sessionDay: row.session_day,
        occurredAt: row.occurred_at,
        encryptedPayload: row.encrypted_payload,
        createdAt: row.created_at,
      })),
      limit,
      nextCursor: Number(rows.results?.length || 0) >= limit && last ? { occurredAt: last.occurred_at, id: last.id } : null,
    });
  }

  if (request.method === "POST") {
    const blocked = requireSameOrigin(request, url, env);
    if (blocked) return blocked;
    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength > MAX_HISTORY_REQUEST_BYTES) return json({ error: "History batch is too large" }, 413);
    const body = await request.json().catch(() => null);
    if (!isTrainingHistoryBody(body)) return json({ error: "History batch is invalid" }, 400);
    const createdAt = new Date().toISOString();
    const writes = await env.SYNC_DB.batch(
      body.events.map((event) =>
        env.SYNC_DB.prepare(
          `INSERT INTO training_history_events (
             id, key_hash, event_type, session_day, occurred_at, encrypted_payload, created_at
           ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
           ON CONFLICT(id) DO NOTHING`
        ).bind(event.id, keyHash, event.eventType, event.sessionDay, event.occurredAt, event.encryptedPayload, createdAt)
      )
    );
    const inserted = writes.reduce((total, result) => total + Number(result.meta.changes || 0), 0);
    return json({ saved: true, accepted: body.events.length, inserted, createdAt }, 201);
  }

  return json({ error: "Method not allowed" }, 405);
}

// -- Oura integration --------------------------------------------------------

async function ouraStatus(request: Request, env: Env): Promise<Response> {
  const keyHash = await recoveryKeyHash(request);
  if (!keyHash) return json({ error: "Cloud autosave recovery key required" }, 401);
  const row = await env.SYNC_DB.prepare(
    "SELECT scopes, updated_at FROM oauth_connections WHERE key_hash = ?1 AND provider = 'oura'"
  )
    .bind(keyHash)
    .first<{ scopes: string; updated_at: string }>();
  return json({
    configured: isOuraConfigured(env),
    connected: Boolean(row),
    scopes: row?.scopes || "",
    updatedAt: row?.updated_at || "",
  });
}

async function beginOuraOAuth(request: Request, env: Env, url: URL): Promise<Response> {
  const keyHash = await recoveryKeyHash(request);
  if (!keyHash) return json({ error: "Turn on cloud autosave before connecting Oura" }, 401);
  if (!isOuraConfigured(env)) return json({ error: "Oura application credentials have not been added yet" }, 503);

  const state = randomHex();
  const stateHash = await sha256Hex(`pitching-os-oura-state-v1:${state}`);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OAUTH_STATE_LIFETIME_MS).toISOString();

  await env.SYNC_DB.batch([
    env.SYNC_DB.prepare("DELETE FROM oauth_states WHERE expires_at < ?1").bind(now.toISOString()),
    env.SYNC_DB.prepare(
      "INSERT INTO oauth_states (state_hash, key_hash, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)"
    ).bind(stateHash, keyHash, expiresAt, now.toISOString()),
  ]);

  const redirectUri = `${applicationOrigin(env, url)}/api/integrations/oura/callback`;
  const authorize = new URL(OURA_AUTHORIZE_URL);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", env.OURA_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("scope", OURA_SCOPE);
  authorize.searchParams.set("state", state);
  return json({ authorizeUrl: authorize.toString() });
}

interface OuraTokenReply {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}

async function exchangeOuraToken(parameters: URLSearchParams, env: Env): Promise<OuraTokenReply> {
  const response = await fetch(OURA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: parameters.toString(),
  });
  const replyValue = await response.json().catch(() => ({}));
  const reply = isOuraTokenReply(replyValue) ? replyValue : {};
  if (!response.ok || typeof reply.access_token !== "string" || typeof reply.refresh_token !== "string") {
    throw new Error("Oura token exchange failed");
  }
  const expiresIn = finiteNumber(reply.expires_in, 60, 365 * 24 * 60 * 60);
  if (!expiresIn) throw new Error("Oura returned an invalid token lifetime");
  return {
    access_token: reply.access_token,
    refresh_token: reply.refresh_token,
    expires_in: expiresIn,
    scope: typeof reply.scope === "string" ? reply.scope : OURA_SCOPE,
  };
}

async function handleOuraCallback(request: Request, env: Env, url: URL): Promise<Response> {
  const origin = applicationOrigin(env, url);
  const state = url.searchParams.get("state");
  if (!state || !SYNC_KEY_PATTERN.test(state)) return redirectToIntegration(origin, "invalid-state");

  const stateHash = await sha256Hex(`pitching-os-oura-state-v1:${state}`);
  const row = await env.SYNC_DB.prepare(
    "SELECT key_hash, expires_at FROM oauth_states WHERE state_hash = ?1"
  )
    .bind(stateHash)
    .first<{ key_hash: string; expires_at: string }>();
  await env.SYNC_DB.prepare("DELETE FROM oauth_states WHERE state_hash = ?1").bind(stateHash).run();

  if (!row || Date.parse(row.expires_at) < Date.now()) return redirectToIntegration(origin, "expired");
  if (url.searchParams.get("error")) return redirectToIntegration(origin, "denied");

  const code = url.searchParams.get("code");
  if (!code || code.length > 500) return redirectToIntegration(origin, "failed");

  const redirectUri = `${origin}/api/integrations/oura/callback`;
  const parameters = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: env.OURA_CLIENT_ID,
    client_secret: env.OURA_CLIENT_SECRET,
  });

  try {
    const token = await exchangeOuraToken(parameters, env);
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + Number(token.expires_in) * 1000).toISOString();
    const [accessEncrypted, refreshEncrypted] = await Promise.all([
      encryptSecret(String(token.access_token), env),
      encryptSecret(String(token.refresh_token), env),
    ]);
    await env.SYNC_DB.prepare(
      `INSERT INTO oauth_connections (
         key_hash, provider, access_token_encrypted, refresh_token_encrypted, expires_at,
         scopes, provider_user_id, created_at, updated_at
       ) VALUES (?1, 'oura', ?2, ?3, ?4, ?5, '', ?6, ?6)
       ON CONFLICT(key_hash, provider) DO UPDATE SET
         access_token_encrypted = excluded.access_token_encrypted,
         refresh_token_encrypted = excluded.refresh_token_encrypted,
         expires_at = excluded.expires_at,
         scopes = excluded.scopes,
         updated_at = excluded.updated_at`
    )
      .bind(row.key_hash, accessEncrypted, refreshEncrypted, expiresAt, token.scope, now)
      .run();
    return redirectToIntegration(origin, "connected");
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "Oura OAuth callback failed",
        error: error instanceof Error ? error.message : String(error),
      })
    );
    return redirectToIntegration(origin, "failed");
  }
}

async function currentOuraAccessToken(keyHash: string, env: Env): Promise<string> {
  const row = await env.SYNC_DB.prepare(
    `SELECT access_token_encrypted, refresh_token_encrypted, expires_at, scopes, updated_at
     FROM oauth_connections WHERE key_hash = ?1 AND provider = 'oura'`
  )
    .bind(keyHash)
    .first<{ access_token_encrypted: string; refresh_token_encrypted: string; expires_at: string }>();
  if (!row) throw new Error("Oura is not connected");
  if (Date.parse(row.expires_at) > Date.now() + 60_000) return decryptSecret(row.access_token_encrypted, env);

  const refreshToken = await decryptSecret(row.refresh_token_encrypted, env);
  const parameters = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: env.OURA_CLIENT_ID,
    client_secret: env.OURA_CLIENT_SECRET,
  });
  const token = await exchangeOuraToken(parameters, env);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + Number(token.expires_in) * 1000).toISOString();
  const [accessEncrypted, refreshEncrypted] = await Promise.all([
    encryptSecret(String(token.access_token), env),
    encryptSecret(String(token.refresh_token), env),
  ]);
  await env.SYNC_DB.prepare(
    `UPDATE oauth_connections SET access_token_encrypted = ?2, refresh_token_encrypted = ?3,
       expires_at = ?4, scopes = ?5, updated_at = ?6
     WHERE key_hash = ?1 AND provider = 'oura'`
  )
    .bind(keyHash, accessEncrypted, refreshEncrypted, expiresAt, token.scope, now)
    .run();
  return String(token.access_token);
}

async function fetchOuraResource(path: string, token: string, parameters: Record<string, string> = {}): Promise<any> {
  const rows: unknown[] = [];
  const seenTokens = new Set<string>();
  let nextToken = "";
  let firstPage: Record<string, unknown> = {};

  for (let page = 0; page < 100; page += 1) {
    const endpoint = new URL(`${OURA_API_BASE}/${path}`);
    for (const [key, value] of Object.entries(parameters)) endpoint.searchParams.set(key, value);
    if (nextToken) endpoint.searchParams.set("next_token", nextToken);
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`${path} (${response.status})`);
    const payload = await response.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
    const record = payload as Record<string, unknown>;
    if (page === 0) firstPage = record;
    if (Array.isArray(record.data)) rows.push(...record.data);
    const candidate = typeof record.next_token === "string" ? record.next_token : "";
    if (!candidate) return rows.length ? { ...firstPage, data: rows, next_token: null } : firstPage;
    if (seenTokens.has(candidate)) throw new Error(`${path} returned a repeated pagination token`);
    seenTokens.add(candidate);
    nextToken = candidate;
  }
  throw new Error(`${path} exceeded the pagination safety limit`);
}

function resourceRows(resource: unknown): Record<string, unknown>[] {
  if (!resource || typeof resource !== "object" || Array.isArray(resource)) return [];
  const data = (resource as Record<string, unknown>).data;
  return Array.isArray(data) ? data.filter((item) => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function dailyOuraRow(snapshot: Record<string, unknown>, key: string, day: string): Record<string, unknown> | null {
  return resourceRows(snapshot[key]).find((item) => item.day === day) || null;
}

function nestedNumber(record: Record<string, unknown> | null, key: string, nestedKey: string, min: number, max: number): number | null {
  const nested = record?.[key];
  return nested && typeof nested === "object" && !Array.isArray(nested)
    ? finiteNumber((nested as Record<string, unknown>)[nestedKey], min, max)
    : null;
}

async function fetchAllOuraData(token: string, day: string): Promise<Record<string, unknown>> {
  const startDateTime = `${addUtcDays(day, -1)}T00:00:00+10:00`;
  const endDateTime = `${addUtcDays(day, 1)}T23:59:59+10:00`;
  const datePaths = [
    "daily_activity",
    "daily_cardiovascular_age",
    "daily_readiness",
    "daily_resilience",
    "daily_sleep",
    "daily_spo2",
    "daily_stress",
    "enhanced_tag",
    "session",
    "sleep",
    "sleep_time",
    "tag",
    "vO2_max",
    "workout",
  ];
  const requests: [string, Record<string, string>][] = [
    ...datePaths.map((path): [string, Record<string, string>] => [path, { start_date: day, end_date: day }]),
    ["rest_mode_period", { start_date: addUtcDays(day, -365), end_date: day }],
    ["heartrate", { start_datetime: startDateTime, end_datetime: endDateTime }],
    ["ring_battery_level", { start_datetime: startDateTime, end_datetime: endDateTime }],
    ["personal_info", {}],
    ["ring_configuration", {}],
  ];

  const snapshot: Record<string, unknown> = {};
  for (let index = 0; index < requests.length; index += 4) {
    const batch = requests.slice(index, index + 4);
    const results = await Promise.all(
      batch.map(async ([path, parameters]) => {
        try {
          return { path, value: await fetchOuraResource(path, token, parameters) };
        } catch (error) {
          return { path, error: error instanceof Error ? error.message : `${path} unavailable` };
        }
      })
    );
    for (const result of results) {
      if ("value" in result) snapshot[result.path] = result.value;
      else snapshot[`${result.path}_error`] = result.error;
    }
  }
  return snapshot;
}

function ouraSummaryFromSnapshot(snapshot: Record<string, unknown>, day: string, includeRaw = false): Record<string, unknown> {
  const dailySleep = dailyOuraRow(snapshot, "daily_sleep", day);
  const dailyReadiness = dailyOuraRow(snapshot, "daily_readiness", day);
  const dailyActivity = dailyOuraRow(snapshot, "daily_activity", day);
  const dailyStress = dailyOuraRow(snapshot, "daily_stress", day);
  const dailyResilience = dailyOuraRow(snapshot, "daily_resilience", day);
  const dailySpO2 = dailyOuraRow(snapshot, "daily_spo2", day);
  const cardiovascularAge = dailyOuraRow(snapshot, "daily_cardiovascular_age", day);
  const vo2Max = dailyOuraRow(snapshot, "vO2_max", day);
  const restModeRows = resourceRows(snapshot.rest_mode_period);
  const sleepCandidates = resourceRows(snapshot.sleep).filter((item) => item.day === day);
  const sleep = sleepCandidates.reduce((best: Record<string, unknown> | null, item) => {
    const itemDuration = finiteNumber(item.total_sleep_duration, 0, 24 * 60 * 60) || 0;
    const bestDuration = best ? finiteNumber(best.total_sleep_duration, 0, 24 * 60 * 60) || 0 : -1;
    return itemDuration > bestDuration ? item : best;
  }, null);
  const personalInfo =
    snapshot.personal_info && typeof snapshot.personal_info === "object" && !Array.isArray(snapshot.personal_info)
      ? (snapshot.personal_info as Record<string, unknown>)
      : null;
  const batteryRows = resourceRows(snapshot.ring_battery_level);
  const latestBattery = batteryRows.at(-1) || null;
  const totalSleepSeconds = sleep ? finiteNumber(sleep.total_sleep_duration, 0, 24 * 60 * 60) : null;

  const summary: Record<string, unknown> = {
    sleepHours: totalSleepSeconds === null ? null : Math.round((totalSleepSeconds / 3600) * 100) / 100,
    sleepScore: dailySleep ? finiteNumber(dailySleep.score, 0, 100) : null,
    readinessScore: dailyReadiness ? finiteNumber(dailyReadiness.score, 0, 100) : null,
    restingHeartRate: sleep ? finiteNumber(sleep.lowest_heart_rate, 20, 240) : null,
    hrvMs: sleep ? finiteNumber(sleep.average_hrv, 0, 500) : null,
    bodyweightKg: personalInfo ? finiteNumber(personalInfo.weight, 35, 250) : null,
    activityScore: dailyActivity ? finiteNumber(dailyActivity.score, 0, 100) : null,
    steps: dailyActivity ? finiteNumber(dailyActivity.steps, 0, 200_000) : null,
    activeCalories: dailyActivity ? finiteNumber(dailyActivity.active_calories, 0, 20_000) : null,
    totalCalories: dailyActivity ? finiteNumber(dailyActivity.total_calories, 0, 30_000) : null,
    temperatureDeviation: dailyReadiness ? finiteNumber(dailyReadiness.temperature_deviation, -10, 10) : null,
    spo2Average: nestedNumber(dailySpO2, "spo2_percentage", "average", 0, 100),
    stressHighMinutes: dailyStress ? Math.round(Number(finiteNumber(dailyStress.stress_high, 0, 86400) || 0) / 60) : null,
    recoveryHighMinutes: dailyStress ? Math.round(Number(finiteNumber(dailyStress.recovery_high, 0, 86400) || 0) / 60) : null,
    stressSummary: typeof dailyStress?.day_summary === "string" ? dailyStress.day_summary : null,
    resilienceLevel: typeof dailyResilience?.level === "string" ? dailyResilience.level : null,
    vascularAge: cardiovascularAge ? finiteNumber(cardiovascularAge.vascular_age, 18, 100) : null,
    vo2Max: vo2Max ? finiteNumber(vo2Max.vo2_max, 0, 100) : null,
    workoutCount: resourceRows(snapshot.workout).length,
    sessionCount: resourceRows(snapshot.session).length,
    tagCount: resourceRows(snapshot.enhanced_tag).length + resourceRows(snapshot.tag).length,
    heartRateSamples: resourceRows(snapshot.heartrate).length,
    ringBatteryLevel: latestBattery ? finiteNumber(latestBattery.level, 0, 100) : null,
    restMode: restModeRows.some((item) => {
      const start = typeof item.start_day === "string" ? item.start_day : "";
      const end = typeof item.end_day === "string" ? item.end_day : day;
      return Boolean(start) && start <= day && end >= day;
    }),
  };
  if (includeRaw) summary.ouraData = snapshot;
  return summary;
}

async function fetchOuraDailySummary(keyHash: string, day: string, env: Env): Promise<Record<string, unknown>> {
  const token = await currentOuraAccessToken(keyHash, env);
  const snapshot = await fetchAllOuraData(token, day);
  return ouraSummaryFromSnapshot(snapshot, day, true);
}

async function fetchOuraHistorySummaries(keyHash: string, startDay: string, endDay: string, env: Env): Promise<Map<string, Record<string, unknown>>> {
  const token = await currentOuraAccessToken(keyHash, env);
  const paths = [
    "daily_activity",
    "daily_cardiovascular_age",
    "daily_readiness",
    "daily_resilience",
    "daily_sleep",
    "daily_spo2",
    "daily_stress",
    "enhanced_tag",
    "session",
    "sleep",
    "tag",
    "vO2_max",
    "workout",
  ];
  const requests: [string, Record<string, string>][] = [
    ...paths.map((path): [string, Record<string, string>] => [path, { start_date: startDay, end_date: endDay }]),
    ["rest_mode_period", { start_date: addUtcDays(startDay, -365), end_date: endDay }],
    ["personal_info", {}],
  ];

  const snapshot: Record<string, unknown> = {};
  for (let index = 0; index < requests.length; index += 4) {
    const results = await Promise.all(
      requests.slice(index, index + 4).map(async ([path, parameters]) => {
        try {
          return { path, value: await fetchOuraResource(path, token, parameters) };
        } catch (error) {
          return { path, error: error instanceof Error ? error.message : `${path} unavailable` };
        }
      })
    );
    for (const result of results) {
      if ("value" in result) snapshot[result.path] = result.value;
      else snapshot[`${result.path}_error`] = result.error;
    }
  }

  const summaries = new Map<string, Record<string, unknown>>();
  for (let day = startDay; day <= endDay; day = addUtcDays(day, 1)) {
    summaries.set(day, ouraSummaryFromSnapshot(snapshot, day));
  }
  return summaries;
}

async function upsertHealthDaily(keyHash: string, provider: string, day: string, summary: Record<string, unknown>, env: Env): Promise<void> {
  const now = new Date().toISOString();
  const summaryEncrypted = await encryptSecret(JSON.stringify(summary), env);
  await env.SYNC_DB.prepare(
    `INSERT INTO health_daily (
       key_hash, provider, day, summary_encrypted, source_updated_at, created_at, updated_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?5)
     ON CONFLICT(key_hash, provider, day) DO UPDATE SET
       summary_encrypted = excluded.summary_encrypted,
       source_updated_at = excluded.source_updated_at,
       updated_at = excluded.updated_at`
  )
    .bind(keyHash, provider, day, summaryEncrypted, now)
    .run();
}

function isAppleHealthBody(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function rowToSummary(row: { summary_encrypted: string } | null, env: Env): Promise<Record<string, unknown> | null> {
  if (!row) return null;
  const value = JSON.parse(await decryptSecret(row.summary_encrypted, env));
  if (!isAppleHealthBody(value)) return null;
  const summary = value;
  return {
    sleepHours: finiteNumber(summary.sleepHours, 0, 24),
    sleepScore: finiteNumber(summary.sleepScore, 0, 100),
    readinessScore: finiteNumber(summary.readinessScore, 0, 100),
    restingHeartRate: finiteNumber(summary.restingHeartRate, 20, 240),
    hrvMs: finiteNumber(summary.hrvMs, 0, 500),
    bodyweightKg: finiteNumber(summary.bodyweightKg, 35, 250),
    activityScore: finiteNumber(summary.activityScore, 0, 100),
    // The two Apple Fitness rings the whitelist never carried. Without them
    // the ingest could accept a Move/Exercise payload and the reader would
    // drop it on the way back out.
    exerciseMinutes: finiteNumber(summary.exerciseMinutes, 0, 1440),
    standHours: finiteNumber(summary.standHours, 0, 24),
    respiratoryRate: finiteNumber(summary.respiratoryRate, 0, 60),
    steps: finiteNumber(summary.steps, 0, 200_000),
    activeCalories: finiteNumber(summary.activeCalories, 0, 20_000),
    totalCalories: finiteNumber(summary.totalCalories, 0, 30_000),
    temperatureDeviation: finiteNumber(summary.temperatureDeviation, -10, 10),
    spo2Average: finiteNumber(summary.spo2Average, 0, 100),
    stressHighMinutes: finiteNumber(summary.stressHighMinutes, 0, 1440),
    recoveryHighMinutes: finiteNumber(summary.recoveryHighMinutes, 0, 1440),
    stressSummary: typeof summary.stressSummary === "string" ? summary.stressSummary : null,
    resilienceLevel: typeof summary.resilienceLevel === "string" ? summary.resilienceLevel : null,
    vascularAge: finiteNumber(summary.vascularAge, 18, 100),
    vo2Max: finiteNumber(summary.vo2Max, 0, 100),
    workoutCount: finiteNumber(summary.workoutCount, 0, 100) || 0,
    sessionCount: finiteNumber(summary.sessionCount, 0, 100) || 0,
    tagCount: finiteNumber(summary.tagCount, 0, 500) || 0,
    heartRateSamples: finiteNumber(summary.heartRateSamples, 0, 100_000) || 0,
    ringBatteryLevel: finiteNumber(summary.ringBatteryLevel, 0, 100),
    restMode: summary.restMode === true,
    ouraData:
      summary.ouraData && typeof summary.ouraData === "object" && !Array.isArray(summary.ouraData)
        ? summary.ouraData
        : undefined,
  };
}

async function dailyHealth(request: Request, env: Env, url: URL): Promise<Response> {
  const keyHash = await recoveryKeyHash(request);
  if (!keyHash) return json({ error: "Cloud autosave recovery key required" }, 401);
  const day = url.searchParams.get("day");
  if (!validDay(day)) return json({ error: "A valid day is required" }, 400);
  const forceRefresh = url.searchParams.get("refresh") === "1";

  const connected = await env.SYNC_DB.prepare(
    "SELECT updated_at FROM oauth_connections WHERE key_hash = ?1 AND provider = 'oura'"
  )
    .bind(keyHash)
    .first();

  let ouraError = "";
  let ouraRow = await env.SYNC_DB.prepare(
    "SELECT * FROM health_daily WHERE key_hash = ?1 AND provider = 'oura' AND day = ?2"
  )
    .bind(keyHash, day)
    .first<{ summary_encrypted: string; updated_at: string }>();
  const stale = !ouraRow || Date.now() - Date.parse(ouraRow.updated_at) > OURA_CACHE_MS;

  if (connected && (forceRefresh || stale)) {
    try {
      const summary = await fetchOuraDailySummary(keyHash, day, env);
      await upsertHealthDaily(keyHash, "oura", day, summary, env);
      ouraRow = await env.SYNC_DB.prepare(
        "SELECT * FROM health_daily WHERE key_hash = ?1 AND provider = 'oura' AND day = ?2"
      )
        .bind(keyHash, day)
        .first<{ summary_encrypted: string; updated_at: string }>();
    } catch (error) {
      ouraError = error instanceof Error ? error.message : "Oura refresh failed";
    }
  }

  const appleRow = await env.SYNC_DB.prepare(
    "SELECT * FROM health_daily WHERE key_hash = ?1 AND provider = 'apple_health' AND day = ?2"
  )
    .bind(keyHash, day)
    .first<{ summary_encrypted: string; updated_at: string }>();

  const [oura, apple] = await Promise.all([rowToSummary(ouraRow ?? null, env), rowToSummary(appleRow ?? null, env)]);
  const publicOura = oura ? { ...oura, ouraData: undefined } : null;
  const merged = {
    sleepHours: oura?.sleepHours ?? apple?.sleepHours ?? null,
    sleepScore: oura?.sleepScore ?? null,
    readinessScore: oura?.readinessScore ?? null,
    restingHeartRate: oura?.restingHeartRate ?? apple?.restingHeartRate ?? null,
    hrvMs: oura?.hrvMs ?? apple?.hrvMs ?? null,
    bodyweightKg: oura?.bodyweightKg ?? apple?.bodyweightKg ?? null,
    activityScore: oura?.activityScore ?? null,
    steps: oura?.steps ?? null,
    activeCalories: oura?.activeCalories ?? null,
    totalCalories: oura?.totalCalories ?? null,
    temperatureDeviation: oura?.temperatureDeviation ?? null,
    spo2Average: oura?.spo2Average ?? null,
    stressHighMinutes: oura?.stressHighMinutes ?? null,
    recoveryHighMinutes: oura?.recoveryHighMinutes ?? null,
    stressSummary: oura?.stressSummary ?? null,
    resilienceLevel: oura?.resilienceLevel ?? null,
    vascularAge: oura?.vascularAge ?? null,
    vo2Max: oura?.vo2Max ?? null,
    workoutCount: oura?.workoutCount ?? 0,
    sessionCount: oura?.sessionCount ?? 0,
    tagCount: oura?.tagCount ?? 0,
    heartRateSamples: oura?.heartRateSamples ?? 0,
    ringBatteryLevel: oura?.ringBatteryLevel ?? null,
    restMode: oura?.restMode ?? false,
  };

  return json({
    day,
    merged,
    sources: {
      oura: { connected: Boolean(connected), data: publicOura, updatedAt: ouraRow?.updated_at || "", error: ouraError },
      appleHealth: { connected: Boolean(appleRow), data: apple, updatedAt: appleRow?.updated_at || "" },
    },
  });
}

async function healthHistory(request: Request, env: Env, url: URL): Promise<Response> {
  const keyHash = await recoveryKeyHash(request);
  if (!keyHash) return json({ error: "Cloud autosave recovery key required" }, 401);
  const endDay = url.searchParams.get("end");
  if (!validDay(endDay)) return json({ error: "A valid end day is required" }, 400);
  const days = Math.min(90, Math.max(7, Number(url.searchParams.get("days") || 28)));
  const startDay = addUtcDays(endDay, -(days - 1));

  const connected = await env.SYNC_DB.prepare(
    "SELECT updated_at FROM oauth_connections WHERE key_hash = ?1 AND provider = 'oura'"
  )
    .bind(keyHash)
    .first();

  let refreshError = "";
  if (connected && url.searchParams.get("refresh") === "1") {
    try {
      const summaries = await fetchOuraHistorySummaries(keyHash, startDay, endDay, env);
      const entries = [...summaries.entries()];
      for (let index = 0; index < entries.length; index += 4) {
        await Promise.all(entries.slice(index, index + 4).map(([day, summary]) => upsertHealthDaily(keyHash, "oura", day, summary, env)));
      }
    } catch (error) {
      refreshError = error instanceof Error ? error.message : "Oura history refresh failed";
    }
  }

  const rows = await env.SYNC_DB.prepare(
    `SELECT provider, day, summary_encrypted, source_updated_at, updated_at
     FROM health_daily
     WHERE key_hash = ?1 AND day BETWEEN ?2 AND ?3
     ORDER BY day ASC`
  )
    .bind(keyHash, startDay, endDay)
    .all<{ provider: string; day: string; summary_encrypted: string; updated_at: string }>();

  const records: Record<string, unknown> = {};
  const byDay = new Map<string, Record<string, { summary_encrypted: string; updated_at: string }>>();
  for (const row of rows.results || []) {
    const providers = byDay.get(row.day) || {};
    providers[row.provider] = row;
    byDay.set(row.day, providers);
  }

  for (const [day, providers] of byDay) {
    const [oura, apple] = await Promise.all([
      rowToSummary(providers.oura || null, env),
      rowToSummary(providers.apple_health || null, env),
    ]);
    const publicOura = oura ? { ...oura, ouraData: undefined } : null;
    records[day] = {
      day,
      merged: {
        sleepHours: oura?.sleepHours ?? apple?.sleepHours ?? null,
        sleepScore: oura?.sleepScore ?? null,
        readinessScore: oura?.readinessScore ?? null,
        restingHeartRate: oura?.restingHeartRate ?? apple?.restingHeartRate ?? null,
        hrvMs: oura?.hrvMs ?? apple?.hrvMs ?? null,
        bodyweightKg: oura?.bodyweightKg ?? apple?.bodyweightKg ?? null,
      },
      sources: {
        oura: { connected: Boolean(connected), data: publicOura, updatedAt: providers.oura?.updated_at || "", error: refreshError },
        appleHealth: { connected: Boolean(providers.apple_health), data: apple, updatedAt: providers.apple_health?.updated_at || "" },
      },
    };
  }

  return json({ startDay, endDay, days, records, refreshError });
}

async function disconnectOura(request: Request, env: Env): Promise<Response> {
  const keyHash = await recoveryKeyHash(request);
  if (!keyHash) return json({ error: "Cloud autosave recovery key required" }, 401);
  const row = await env.SYNC_DB.prepare(
    "SELECT access_token_encrypted FROM oauth_connections WHERE key_hash = ?1 AND provider = 'oura'"
  )
    .bind(keyHash)
    .first<{ access_token_encrypted: string }>();
  if (row) {
    try {
      const token = await decryptSecret(row.access_token_encrypted, env);
      const revoke = new URL("https://api.ouraring.com/oauth/revoke");
      revoke.searchParams.set("access_token", token);
      await fetch(revoke, { method: "POST" });
    } catch (error) {
      console.error(
        JSON.stringify({ message: "Oura revocation request failed", error: error instanceof Error ? error.message : String(error) })
      );
    }
  }
  await env.SYNC_DB.batch([
    env.SYNC_DB.prepare("DELETE FROM oauth_connections WHERE key_hash = ?1 AND provider = 'oura'").bind(keyHash),
    env.SYNC_DB.prepare("DELETE FROM health_daily WHERE key_hash = ?1 AND provider = 'oura'").bind(keyHash),
  ]);
  return json({ disconnected: true });
}

// -- Apple Health integration (Shortcuts-based upload) -----------------------

async function appleStatus(request: Request, env: Env): Promise<Response> {
  const keyHash = await recoveryKeyHash(request);
  if (!keyHash) return json({ error: "Cloud autosave recovery key required" }, 401);
  const row = await env.SYNC_DB.prepare(
    "SELECT created_at, updated_at, last_upload_at FROM apple_health_connections WHERE key_hash = ?1"
  )
    .bind(keyHash)
    .first<{ created_at: string; updated_at: string; last_upload_at: string | null }>();
  return json({ connected: Boolean(row), createdAt: row?.created_at || "", lastUploadAt: row?.last_upload_at || "" });
}

async function createAppleUploadToken(request: Request, env: Env, url: URL): Promise<Response> {
  const keyHash = await recoveryKeyHash(request);
  if (!keyHash) return json({ error: "Turn on cloud autosave before setting up Apple Health" }, 401);
  const uploadToken = randomHex();
  const uploadTokenHash = await sha256Hex(`pitching-os-apple-health-v1:${uploadToken}`);
  const now = new Date().toISOString();
  await env.SYNC_DB.prepare(
    `INSERT INTO apple_health_connections (key_hash, upload_token_hash, created_at, updated_at, last_upload_at)
     VALUES (?1, ?2, ?3, ?3, NULL)
     ON CONFLICT(key_hash) DO UPDATE SET
       upload_token_hash = excluded.upload_token_hash,
       updated_at = excluded.updated_at,
       last_upload_at = NULL`
  )
    .bind(keyHash, uploadTokenHash, now)
    .run();
  return json({
    connected: true,
    uploadToken,
    endpoint: `${url.origin}/api/integrations/apple/ingest`,
    note: "This upload token is shown once. Store it only in your private iPhone Shortcut or companion app.",
  });
}

async function ingestAppleHealth(request: Request, env: Env): Promise<Response> {
  const token = bearerToken(request);
  if (!token) return json({ error: "Invalid Apple Health upload token" }, 401);
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > MAX_HEALTH_PAYLOAD_BYTES) return json({ error: "Apple Health payload is too large" }, 413);

  const uploadTokenHash = await sha256Hex(`pitching-os-apple-health-v1:${token}`);
  const connection = await env.SYNC_DB.prepare(
    "SELECT key_hash FROM apple_health_connections WHERE upload_token_hash = ?1"
  )
    .bind(uploadTokenHash)
    .first<{ key_hash: string }>();
  if (!connection) return json({ error: "Apple Health upload token is no longer valid" }, 401);

  const body = await request.json().catch(() => null);
  if (!isAppleHealthBody(body)) return json({ error: "Apple Health payload needs a valid day" }, 400);
  const day = typeof body.day === "string" ? body.day : "";
  if (!validDay(day)) return json({ error: "Apple Health payload needs a valid day" }, 400);

  // Validated against the shared field table, which the setup instructions are
  // also generated from — two hand-kept lists would drift, and the failure is
  // silent: a Shortcut built from a documented name the Worker no longer takes
  // gets a 400 the phone never shows, which reads as the ring not syncing.
  const read = readApplePayload(body);
  if (isEmptyPayload(read)) {
    return json({ error: "No supported Apple Health values were supplied" }, 400);
  }
  const summary = { ...read, sleepScore: null, readinessScore: null };

  await upsertHealthDaily(connection.key_hash, "apple_health", day, summary, env);
  const now = new Date().toISOString();
  await env.SYNC_DB.prepare(
    "UPDATE apple_health_connections SET last_upload_at = ?2, updated_at = ?2 WHERE key_hash = ?1"
  )
    .bind(connection.key_hash, now)
    .run();
  return json({ saved: true, day, received: suppliedFields(read) });
}

async function disconnectAppleHealth(request: Request, env: Env): Promise<Response> {
  const keyHash = await recoveryKeyHash(request);
  if (!keyHash) return json({ error: "Cloud autosave recovery key required" }, 401);
  await env.SYNC_DB.batch([
    env.SYNC_DB.prepare("DELETE FROM apple_health_connections WHERE key_hash = ?1").bind(keyHash),
    env.SYNC_DB.prepare("DELETE FROM health_daily WHERE key_hash = ?1 AND provider = 'apple_health'").bind(keyHash),
  ]);
  return json({ disconnected: true });
}

// -- Mechanics video upload + AI screening ------------------------------------

function boundedContentLength(request: Request, maximum: number): number | null {
  const value = Number(request.headers.get("Content-Length") || 0);
  return Number.isInteger(value) && value > 0 && value <= maximum ? value : null;
}

async function listMechanicsVideos(request: Request, env: Env): Promise<Response> {
  const keyHash = await recoveryKeyHash(request);
  if (!keyHash) return json({ error: "Cloud autosave recovery key required" }, 401);
  const rows = await env.SYNC_DB.prepare(
    `SELECT id, key_hash, object_key, file_name, content_type, byte_size, angle,
       captured_on, pitch_context, notes, created_at, updated_at
     FROM mechanics_videos WHERE key_hash = ?1 ORDER BY created_at DESC LIMIT 40`
  )
    .bind(keyHash)
    .all<{
      id: string;
      file_name: string;
      content_type: string;
      byte_size: number;
      angle: string;
      captured_on: string;
      pitch_context: string;
      notes: string;
      created_at: string;
    }>();
  const videos = await Promise.all(
    (rows.results || []).map(async (row) => ({
      id: row.id,
      fileName: row.file_name,
      contentType: row.content_type,
      byteSize: row.byte_size,
      angle: row.angle,
      capturedOn: row.captured_on,
      pitchContext: row.pitch_context,
      notes: row.notes,
      createdAt: row.created_at,
      playbackUrl: await privateMediaUrl(`/api/mechanics/videos/${encodeURIComponent(row.id)}/content`, row.id, keyHash, env),
    }))
  );
  return json({ videos });
}

async function uploadMechanicsVideo(request: Request, env: Env, url: URL, id: string): Promise<Response> {
  const keyHash = await recoveryKeyHash(request);
  if (!keyHash) return json({ error: "Cloud autosave recovery key required" }, 401);
  if (!MEDIA_ID_PATTERN.test(id)) return json({ error: "Invalid video identifier" }, 400);

  const contentType = (request.headers.get("Content-Type") || "").split(";")[0].toLowerCase();
  if (!VIDEO_TYPES.has(contentType)) return json({ error: "Use an MP4, MOV or WebM video" }, 415);
  const byteSize = boundedContentLength(request, MAX_MECHANICS_VIDEO_BYTES);
  if (!byteSize) return json({ error: "Video must be between 1 byte and 95 MB" }, 413);
  if (!request.body) return json({ error: "Video body is required" }, 400);

  const mediaBucket = privateMediaBucket(env);
  if (!mediaBucket) return json({ error: "Private media storage is awaiting account activation" }, 503);

  const capturedOn = url.searchParams.get("capturedOn") || "";
  if (capturedOn && !validDay(capturedOn)) return json({ error: "Capture date is invalid" }, 400);

  const objectKey = `${keyHash}/mechanics/${id}`;
  const now = new Date().toISOString();
  await mediaBucket.put(objectKey, request.body, {
    httpMetadata: { contentType, cacheControl: "private, no-store" },
    customMetadata: { owner: keyHash, mediaId: id },
  });

  try {
    const write = await env.SYNC_DB.prepare(
      `INSERT INTO mechanics_videos (
         id, key_hash, object_key, file_name, content_type, byte_size, angle,
         captured_on, pitch_context, notes, created_at, updated_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)
       ON CONFLICT(id) DO UPDATE SET
         file_name = excluded.file_name, content_type = excluded.content_type,
         byte_size = excluded.byte_size, angle = excluded.angle,
         captured_on = excluded.captured_on, pitch_context = excluded.pitch_context,
         notes = excluded.notes, updated_at = excluded.updated_at
       WHERE mechanics_videos.key_hash = excluded.key_hash`
    )
      .bind(
        id,
        keyHash,
        objectKey,
        cleanText(url.searchParams.get("fileName"), 160) || "Pitching video",
        contentType,
        byteSize,
        cleanText(url.searchParams.get("angle"), 30),
        capturedOn,
        cleanText(url.searchParams.get("pitchContext"), 120),
        cleanText(url.searchParams.get("notes"), 500),
        now
      )
      .run();
    if (Number(write.meta.changes || 0) !== 1) throw new Error("Video metadata ownership conflict");
  } catch (error) {
    await mediaBucket.delete(objectKey);
    throw error;
  }

  const playbackUrl = await privateMediaUrl(`/api/mechanics/videos/${encodeURIComponent(id)}/content`, id, keyHash, env);
  return json({ saved: true, id, playbackUrl }, 201);
}

function aiJsonRecord(value: unknown): Record<string, unknown> {
  let candidate: unknown = value;
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate) && "response" in candidate) {
    candidate = (candidate as Record<string, unknown>).response;
  }
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate) && Array.isArray((candidate as Record<string, unknown>).choices)) {
    const first = ((candidate as Record<string, unknown>).choices as unknown[])[0];
    const message = first && typeof first === "object" && !Array.isArray(first) ? (first as Record<string, unknown>).message : null;
    candidate = message && typeof message === "object" && !Array.isArray(message) ? (message as Record<string, unknown>).content : null;
  }
  if (typeof candidate === "string") {
    const match = candidate.match(/\{[\s\S]*\}/);
    candidate = match ? JSON.parse(match[0]) : null;
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("The AI analysis could not be read");
  return candidate as Record<string, unknown>;
}

async function analyzeMechanicsContactSheet(request: Request, env: Env, url: URL): Promise<Response> {
  const keyHash = await recoveryKeyHash(request);
  if (!keyHash) return json({ error: "Cloud autosave recovery key required" }, 401);

  const contentType = (request.headers.get("Content-Type") || "").split(";")[0].toLowerCase();
  if (!IMAGE_TYPES.has(contentType)) return json({ error: "Mechanics analysis requires a JPEG, PNG or WebP contact sheet" }, 415);
  const byteSize = boundedContentLength(request, MAX_MECHANICS_CONTACT_SHEET_BYTES);
  if (!byteSize) return json({ error: "Mechanics contact sheet must be smaller than 5 MB" }, 413);

  const angle = cleanText(url.searchParams.get("angle"), 30);
  if (!["open_side", "rear", "dual"].includes(angle)) {
    return json({ error: "AI screening requires an open-side, rear or dual-view capture" }, 400);
  }
  const capturedOn = url.searchParams.get("capturedOn") || "";
  if (!validDay(capturedOn)) return json({ error: "Capture date is invalid" }, 400);
  const pitchContext = cleanText(url.searchParams.get("pitchContext"), 160);

  const imageBytes = new Uint8Array(await request.arrayBuffer());
  if (!imageBytes.length || imageBytes.length > MAX_MECHANICS_CONTACT_SHEET_BYTES) {
    return json({ error: "Mechanics contact sheet is too large" }, 413);
  }
  const dataUrl = `data:${contentType};base64,${bytesToBase64(imageBytes)}`;

  const aiReply = await env.AI.run("@cf/moonshotai/kimi-k2.6" as any, {
    messages: [
      {
        role: "system",
        content:
          "Act as a conservative baseball pitching biomechanics evidence reviewer. First determine whether the capture is usable, then analyse only visible movement organisation. This is a time-ordered phone-video contact sheet, not calibrated 3D motion capture or a biomechanics laboratory assessment. Never invent joint angles, angular velocities, kinetics, force, torque, tissue load, injury risk, diagnosis, or an event that is not visibly supported. Do not compare the athlete with a universal ideal. Mark uncertainty and the supporting view plainly. Return JSON only.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Capture: ${angle}. Context: ${pitchContext || "not supplied"}. Each labelled view contains eight time-ordered panels running left-to-right, top-to-bottom from early delivery through finish. Open-side best supports lateral sequencing; rear view supports direction and plane; dual view provides corroboration. A rear-only capture must describe hip–shoulder separation and layback as not assessable, must not rate or prioritise sequence or arm timing, and may only rate clearly visible lower-half, trunk, release or deceleration organisation. Return {"captureQuality":{"score":0-100,"decision":"pass"|"limited"|"fail","fullBody":string,"blur":string,"cameraStability":string,"eventVisibility":string,"viewConsistency":string,"blockers":string[]},"analyzable":boolean,"summary":string,"confidence":"low"|"medium"|"high","confidenceReason":string,"ratings":{"sequence":1|2|3|4|5,"lowerHalf":1|2|3|4|5,"trunk":1|2|3|4|5,"armTiming":1|2|3|4|5,"release":1|2|3|4|5,"deceleration":1|2|3|4|5},"phaseReview":[{"phase":"Windup"|"Stride"|"Arm cocking"|"Arm acceleration"|"Arm deceleration"|"Follow-through","visible":boolean,"finding":string,"visibleEvidence":string,"view":"open-side"|"rear"|"both"|"not visible","confidence":"low"|"medium"|"high"}],"screening":{"hipShoulderSeparation":string,"layback":string,"armTiming":string,"strideDirection":string,"trunkDirection":string},"observations":[{"phase":string,"finding":string,"visibleEvidence":string,"view":"open-side"|"rear"|"both"|"not visible","confidence":"low"|"medium"|"high"}],"limitations":string[],"priorityIssues":[{"issue":"sequence"|"lowerHalf"|"trunk"|"armTiming"|"release"|"deceleration","rationale":string}]}. A failed capture must set analyzable false, omit ratings, and return no priority issue. A limited capture can rate only clearly supported qualities. Ratings describe visible movement organisation, not measured efficiency or injury risk. The phases are the accepted pitching phases; do not claim an exact event frame unless it is clearly visible. Return at most one priority issue.`,
          },
          { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
        ],
      },
    ],
    max_completion_tokens: 2300,
    temperature: 0,
    store: false,
    response_format: { type: "json_object" },
  } as any);

  const parsed = aiJsonRecord(aiReply);
  const captureRecord =
    parsed.captureQuality && typeof parsed.captureQuality === "object" && !Array.isArray(parsed.captureQuality)
      ? (parsed.captureQuality as Record<string, unknown>)
      : {};
  const captureDecision = ["pass", "limited", "fail"].includes(String(captureRecord.decision).toLowerCase())
    ? String(captureRecord.decision).toLowerCase()
    : "fail";
  const rawCaptureScore = Math.round(Number(captureRecord.score));
  const captureScore = Number.isFinite(rawCaptureScore) ? Math.min(100, Math.max(0, rawCaptureScore)) : 0;
  const analyzable = parsed.analyzable === true && captureDecision !== "fail" && captureScore >= 55;
  const captureQuality = {
    score: captureScore,
    decision: analyzable ? captureDecision : "fail",
    fullBody: cleanText(typeof captureRecord.fullBody === "string" ? captureRecord.fullBody : "Not established", 180),
    blur: cleanText(typeof captureRecord.blur === "string" ? captureRecord.blur : "Not established", 180),
    cameraStability: cleanText(typeof captureRecord.cameraStability === "string" ? captureRecord.cameraStability : "Not established", 180),
    eventVisibility: cleanText(typeof captureRecord.eventVisibility === "string" ? captureRecord.eventVisibility : "Not established", 180),
    viewConsistency: cleanText(typeof captureRecord.viewConsistency === "string" ? captureRecord.viewConsistency : "Not established", 180),
    blockers: Array.isArray(captureRecord.blockers)
      ? captureRecord.blockers.filter((item): item is string => typeof item === "string").slice(0, 6).map((item) => cleanText(item, 180))
      : [],
  };

  const ratings = parsed.ratings && typeof parsed.ratings === "object" && !Array.isArray(parsed.ratings) ? (parsed.ratings as Record<string, unknown>) : {};
  const rearSupportedRatings = new Set(["lowerHalf", "trunk", "release", "deceleration"]);
  const rating = (key: string): number | null => {
    if (!analyzable) return null;
    if (angle === "rear" && !rearSupportedRatings.has(key)) return null;
    const value = Math.round(Number(ratings[key]));
    return Number.isFinite(value) && value >= 1 && value <= 5 ? value : null;
  };

  const confidence = ["low", "medium", "high"].includes(String(parsed.confidence).toLowerCase()) ? String(parsed.confidence).toLowerCase() : "low";
  const screening =
    parsed.screening && typeof parsed.screening === "object" && !Array.isArray(parsed.screening)
      ? Object.fromEntries(
          Object.entries(parsed.screening as Record<string, unknown>).map(([key, value]) => [key, cleanText(typeof value === "string" ? value : "", 220)])
        )
      : ({} as Record<string, string>);
  if (angle === "rear") {
    screening.hipShoulderSeparation = "Not assessable from a rear-only phone view";
    screening.layback = "Not assessable from a rear-only phone view";
    screening.armTiming = "Not rated from a rear-only phone view";
  }

  const observations = Array.isArray(parsed.observations)
    ? parsed.observations
        .slice(0, 8)
        .map((item) => {
          const record = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
          return {
            phase: cleanText(typeof record.phase === "string" ? record.phase : "Visible phase", 80),
            finding: cleanText(typeof record.finding === "string" ? record.finding : "", 220),
            visibleEvidence: cleanText(typeof record.visibleEvidence === "string" ? record.visibleEvidence : "", 260),
            view: ["open-side", "rear", "both", "not visible"].includes(String(record.view).toLowerCase()) ? String(record.view).toLowerCase() : "not visible",
            confidence: ["low", "medium", "high"].includes(String(record.confidence).toLowerCase()) ? String(record.confidence).toLowerCase() : "low",
          };
        })
        .filter((item) => item.finding)
    : [];

  const acceptedPhases = new Set(["Windup", "Stride", "Arm cocking", "Arm acceleration", "Arm deceleration", "Follow-through"]);
  const phaseReview = Array.isArray(parsed.phaseReview)
    ? parsed.phaseReview
        .slice(0, 6)
        .map((item) => {
          const record = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
          const phase = acceptedPhases.has(String(record.phase)) ? String(record.phase) : "";
          return {
            phase,
            visible: record.visible === true,
            finding: cleanText(typeof record.finding === "string" ? record.finding : "", 220),
            visibleEvidence: cleanText(typeof record.visibleEvidence === "string" ? record.visibleEvidence : "", 260),
            view: ["open-side", "rear", "both", "not visible"].includes(String(record.view).toLowerCase()) ? String(record.view).toLowerCase() : "not visible",
            confidence: ["low", "medium", "high"].includes(String(record.confidence).toLowerCase()) ? String(record.confidence).toLowerCase() : "low",
          };
        })
        .filter((item) => item.phase)
    : [];

  const issues = new Set(["sequence", "lowerHalf", "trunk", "armTiming", "release", "deceleration"]);
  const priorityIssues =
    analyzable && Array.isArray(parsed.priorityIssues)
      ? parsed.priorityIssues
          .slice(0, 1)
          .map((item) => {
            const record = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
            const issue = typeof record.issue === "string" && issues.has(record.issue) ? record.issue : "";
            return { issue, rationale: cleanText(typeof record.rationale === "string" ? record.rationale : "", 280) };
          })
          .filter((item) => item.issue && item.rationale && (angle !== "rear" || rearSupportedRatings.has(item.issue)))
      : [];

  return json({
    analysis: {
      source: "aiVideoScreen",
      sourceLabel: angle === "dual" ? "AI dual-view movement screen" : angle === "rear" ? "AI rear-view movement screen" : "AI open-side movement screen",
      measurementClass: "qualitative_phone_video",
      schemaVersion: "biomechanics-screen-v3",
      date: capturedOn,
      pitchContext,
      cameraAngle: angle,
      analyzable,
      captureQuality,
      summary: cleanText(typeof parsed.summary === "string" ? parsed.summary : "Video screening completed.", 700),
      confidence,
      confidenceReason: cleanText(typeof parsed.confidenceReason === "string" ? parsed.confidenceReason : "Confidence limited by a single 2D camera view.", 400),
      sequenceRating: rating("sequence"),
      lowerHalfRating: rating("lowerHalf"),
      trunkRating: rating("trunk"),
      armTimingRating: rating("armTiming"),
      releaseRating: rating("release"),
      decelerationRating: rating("deceleration"),
      screening,
      phaseReview,
      observations,
      limitations: Array.isArray(parsed.limitations) ? parsed.limitations.filter((item): item is string => typeof item === "string").slice(0, 8).map((item) => cleanText(item, 220)) : [],
      aiInterventions: priorityIssues,
      model: "@cf/moonshotai/kimi-k2.6",
      analyzedAt: new Date().toISOString(),
    },
  });
}

async function deleteMechanicsVideo(request: Request, env: Env, id: string): Promise<Response> {
  const keyHash = await recoveryKeyHash(request);
  if (!keyHash) return json({ error: "Cloud autosave recovery key required" }, 401);
  const row = await env.SYNC_DB.prepare("SELECT object_key FROM mechanics_videos WHERE id = ?1 AND key_hash = ?2")
    .bind(id, keyHash)
    .first<{ object_key: string }>();
  if (!row) return json({ error: "Video not found" }, 404);
  const mediaBucket = privateMediaBucket(env);
  if (!mediaBucket) return json({ error: "Private media storage is awaiting account activation" }, 503);
  await mediaBucket.delete(row.object_key);
  await env.SYNC_DB.prepare("DELETE FROM mechanics_videos WHERE id = ?1 AND key_hash = ?2").bind(id, keyHash).run();
  return json({ deleted: true });
}

// -- Session photos (Strava-style recap card) -------------------------------

/**
 * The photo attached to a day's session.
 *
 * Deliberately has no database table. Ownership is *structural*: the object
 * key is `${keyHash}/session/${day}`, so a request can only ever address its
 * own photo — there is no lookup that could return someone else's row, and no
 * schema to migrate. The caption travels in the encrypted sync blob with the
 * rest of the athlete's data, which is where it belongs.
 *
 * Bytes are served against the bearer key rather than a signed URL, so a photo
 * link cannot be forwarded out of the app and remain valid.
 */
function sessionPhotoKey(keyHash: string, day: string): string {
  return `${keyHash}/session/${day}`;
}

async function uploadSessionPhoto(request: Request, env: Env, day: string): Promise<Response> {
  const keyHash = await recoveryKeyHash(request);
  if (!keyHash) return json({ error: "Cloud autosave recovery key required" }, 401);
  if (!validDay(day)) return json({ error: "A valid session day is required" }, 400);

  const contentType = (request.headers.get("Content-Type") || "").split(";")[0].toLowerCase();
  if (!IMAGE_TYPES.has(contentType)) return json({ error: "Use a JPEG, PNG or WebP image" }, 415);
  const byteSize = boundedContentLength(request, MAX_MEAL_PHOTO_BYTES);
  if (!byteSize) return json({ error: "Photo must be between 1 byte and 20 MB" }, 413);
  if (!request.body) return json({ error: "Photo body is required" }, 400);

  const mediaBucket = privateMediaBucket(env);
  if (!mediaBucket) return json({ error: "Private media storage is awaiting account activation" }, 503);

  await mediaBucket.put(sessionPhotoKey(keyHash, day), request.body, {
    httpMetadata: { contentType, cacheControl: "private, no-store" },
    customMetadata: { owner: keyHash, day },
  });

  return json({ saved: true, day, byteSize });
}

async function sessionPhotoContent(request: Request, env: Env, day: string): Promise<Response> {
  const keyHash = await recoveryKeyHash(request);
  if (!keyHash) return json({ error: "Cloud autosave recovery key required" }, 401);
  if (!validDay(day)) return json({ error: "A valid session day is required" }, 400);

  const mediaBucket = privateMediaBucket(env);
  if (!mediaBucket) return json({ error: "Private media storage is awaiting account activation" }, 503);

  const object = await mediaBucket.get(sessionPhotoKey(keyHash, day));
  if (!object) return json({ error: "No photo for that session" }, 404);

  return new Response(object.body, {
    headers: new Headers({
      "Cache-Control": "private, no-store",
      "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
      "Content-Length": String(object.size),
      "X-Content-Type-Options": "nosniff",
    }),
  });
}

async function deleteSessionPhoto(request: Request, env: Env, day: string): Promise<Response> {
  const keyHash = await recoveryKeyHash(request);
  if (!keyHash) return json({ error: "Cloud autosave recovery key required" }, 401);
  if (!validDay(day)) return json({ error: "A valid session day is required" }, 400);

  const mediaBucket = privateMediaBucket(env);
  if (!mediaBucket) return json({ error: "Private media storage is awaiting account activation" }, 503);

  await mediaBucket.delete(sessionPhotoKey(keyHash, day));
  return json({ deleted: true, day });
}

/** Which days have a photo, so the recap list does not guess. */
async function listSessionPhotos(request: Request, env: Env): Promise<Response> {
  const keyHash = await recoveryKeyHash(request);
  if (!keyHash) return json({ error: "Cloud autosave recovery key required" }, 401);

  const mediaBucket = privateMediaBucket(env);
  if (!mediaBucket) return json({ error: "Private media storage is awaiting account activation" }, 503);

  const listed = await mediaBucket.list({ prefix: `${keyHash}/session/`, limit: 500 });
  const days = listed.objects
    .map((object) => object.key.slice(`${keyHash}/session/`.length))
    .filter((day) => validDay(day))
    .sort();

  return json({ days });
}

async function privateMediaContent(env: Env, url: URL, id: string, kind: "mechanics" | "nutrition", request: Request): Promise<Response> {
  const mediaBucket = privateMediaBucket(env);
  if (!mediaBucket) return json({ error: "Private media storage is awaiting account activation" }, 503);
  const table = kind === "mechanics" ? "mechanics_videos" : "meal_photos";
  const row = await env.SYNC_DB.prepare(`SELECT key_hash, object_key, content_type FROM ${table} WHERE id = ?1`)
    .bind(id)
    .first<{ key_hash: string; object_key: string; content_type: string }>();
  if (!row || !(await validMediaSignature(url, id, row.key_hash, env))) return json({ error: "Media link expired" }, 401);

  const rangeHeader = request.headers.get("Range");
  const object = await mediaBucket.get(row.object_key, rangeHeader ? { range: request.headers } : undefined);
  if (!object) return json({ error: "Media not found" }, 404);

  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Content-Type": row.content_type,
    "Accept-Ranges": "bytes",
    ETag: object.httpEtag,
    "X-Content-Type-Options": "nosniff",
  });
  object.writeHttpMetadata(headers);

  if (rangeHeader && object.range && "offset" in object.range && Number.isFinite(object.range.offset) && Number.isFinite(object.range.length)) {
    const offset = Number(object.range.offset);
    const length = Number(object.range.length);
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set("Content-Length", String(length));
    return new Response(object.body, { status: 206, headers });
  }

  headers.set("Content-Length", String(object.size));
  return new Response(object.body, { headers });
}

// -- Nutrition: AI photo/text estimate + Open Food Facts lookups -------------

function nutritionNumber(value: unknown, maximum: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(Math.max(0, Math.min(maximum, numeric))) : 0;
}

interface NutritionEstimate {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: string;
  items: string[];
  assumptions: string[];
}

function parseNutritionEstimate(value: unknown): NutritionEstimate {
  let candidate: unknown = value;
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate) && "response" in candidate) {
    candidate = (candidate as Record<string, unknown>).response;
  }
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate) && Array.isArray((candidate as Record<string, unknown>).choices)) {
    const first = ((candidate as Record<string, unknown>).choices as unknown[])[0];
    const message = first && typeof first === "object" && !Array.isArray(first) ? (first as Record<string, unknown>).message : null;
    candidate = message && typeof message === "object" && !Array.isArray(message) ? (message as Record<string, unknown>).content : null;
  }
  if (typeof candidate === "string") {
    const match = candidate.match(/\{[\s\S]*\}/);
    candidate = match ? JSON.parse(match[0]) : null;
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("The meal estimate could not be read");
  const record = candidate as Record<string, unknown>;
  const confidence = ["low", "medium", "high"].includes(String(record.confidence).toLowerCase()) ? String(record.confidence).toLowerCase() : "low";
  return {
    name: cleanText(typeof record.name === "string" ? record.name : "Meal", 100) || "Meal",
    calories: nutritionNumber(record.calories, 5000),
    protein: nutritionNumber(record.protein, 500),
    carbs: nutritionNumber(record.carbs, 800),
    fat: nutritionNumber(record.fat, 500),
    confidence,
    items: Array.isArray(record.items) ? record.items.filter((item): item is string => typeof item === "string").slice(0, 12).map((item) => cleanText(item, 100)) : [],
    assumptions: Array.isArray(record.assumptions)
      ? record.assumptions.filter((item): item is string => typeof item === "string").slice(0, 8).map((item) => cleanText(item, 160))
      : [],
  };
}

function imageDataUrl(image: ArrayBuffer, contentType: string): string {
  const bytes = new Uint8Array(image);
  let binary = "";
  const chunkSize = 32768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

async function normalizedMealImage(image: ArrayBuffer, contentType: string, env: Env): Promise<{ image: ArrayBuffer; contentType: string }> {
  if (!MEAL_IMAGE_TYPES.has(contentType)) throw new Error("Unsupported meal photo format");
  const source = new Response(image).body;
  if (!source) throw new Error("The iPhone photo could not be read");
  const transformed = await env.IMAGES.input(source).transform({ width: 768, fit: "scale-down" }).output({ format: "image/jpeg", quality: 78 });
  const response = transformed.response();
  if (!response.ok) throw new Error("The iPhone photo could not be converted");
  const converted = await response.arrayBuffer();
  if (!converted.byteLength || converted.byteLength > 5_000_000) throw new Error("The converted iPhone photo is invalid");
  return { image: converted, contentType: "image/jpeg" };
}

async function analyzeMealPhoto(request: Request, env: Env, url: URL): Promise<Response> {
  const keyHash = await nutritionKeyHash(request, env, url);
  if (!keyHash) return json({ error: "Sign in again to analyse a meal photo" }, 401);

  const contentType = (request.headers.get("Content-Type") || "").split(";")[0].toLowerCase();
  if (!MEAL_IMAGE_TYPES.has(contentType)) return json({ error: "Use a JPEG, PNG, WebP, HEIC or HEIF meal photo" }, 415);
  const byteSize = boundedContentLength(request, MAX_MEAL_PHOTO_BYTES);
  if (!byteSize) return json({ error: "Meal photo must be between 1 byte and 20 MB" }, 413);
  const day = url.searchParams.get("day") || "";
  if (!validDay(day)) return json({ error: "A valid meal date is required" }, 400);
  const notes = cleanText(url.searchParams.get("notes"), 400);

  const image = await request.arrayBuffer();
  if (!image.byteLength || image.byteLength > MAX_MEAL_PHOTO_BYTES) return json({ error: "Meal photo is too large" }, 413);
  const normalized = await normalizedMealImage(image, contentType, env);
  const photo = imageDataUrl(normalized.image, normalized.contentType);

  const aiReply = await env.AI.run("@cf/google/gemma-4-26b-a4b-it" as any, {
    messages: [
      {
        role: "system",
        content: "You estimate food nutrition from a meal photo. Identify only visible foods, use the athlete's notes, estimate portions conservatively, and never claim exact hidden ingredients. Return JSON only.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Analyse this single meal. Athlete notes: ${notes || "none"}. Return {"name":string,"calories":number,"protein":number,"carbs":number,"fat":number,"confidence":"low"|"medium"|"high","items":string[],"assumptions":string[]}. Totals must describe the whole visible meal. List visible items and portion assumptions. Use low confidence when portions, sauces, oils or ingredients are unclear.`,
          },
          { type: "image_url", image_url: { url: photo, detail: "auto" } },
        ],
      },
    ],
    max_completion_tokens: 360,
    reasoning_effort: "low",
    chat_template_kwargs: { enable_thinking: false },
    temperature: 0,
    response_format: { type: "json_object" },
  } as any);

  const estimate = parseNutritionEstimate(aiReply);
  return json({
    estimate,
    photoRetained: false,
    notice: "The photo was processed for this estimate and was not stored. Review portions and edit values before saving.",
  });
}

async function analyzeMealText(request: Request, env: Env, url: URL): Promise<Response> {
  const keyHash = await nutritionKeyHash(request, env, url);
  if (!keyHash) return json({ error: "Sign in again to log a meal" }, 401);
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > MAX_NUTRITION_TEXT_BYTES) return json({ error: "Meal description is too long" }, 413);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Enter what you ate" }, 400);
  const description = cleanText(typeof (body as Record<string, unknown>).description === "string" ? (body as Record<string, unknown>).description : "", 700);
  const day = typeof (body as Record<string, unknown>).day === "string" ? ((body as Record<string, unknown>).day as string) : "";
  if (!validDay(day)) return json({ error: "A valid meal date is required" }, 400);
  if (description.length < 3) return json({ error: "Describe the meal in a little more detail" }, 400);

  const aiReply = await env.AI.run("@cf/google/gemma-4-26b-a4b-it" as any, {
    messages: [
      {
        role: "system",
        content:
          "You are an evidence-first Australian food logging assistant. If the description clearly names a restaurant, food chain, brand or menu item, search for the exact current Australian product and prefer the brand/chain's own nutrition page or official PDF. Do not call an item verified unless the exact item and serving are supported by that source. If no exact official source exists, estimate conservatively from stated portions and clearly label it estimated. Never invent a source. Return JSON only.",
      },
      {
        role: "user",
        content: `Log this meal: ${description}. Return {"name":string,"serving":string,"calories":number,"protein":number,"carbs":number,"fat":number,"confidence":"low"|"medium"|"high","items":string[],"assumptions":string[],"brandOrMenuDetected":boolean,"officialMatch":boolean,"sourceUrl":string,"sourceTitle":string,"evidence":string}. Calories and macros must describe the amount eaten. Set officialMatch true only for an exact supported item and serving; otherwise use assumptions and an estimate.`,
      },
    ],
    max_completion_tokens: 760,
    reasoning_effort: "low",
    chat_template_kwargs: { enable_thinking: false },
    temperature: 0,
    response_format: { type: "json_object" },
    web_search_options: {
      search_context_size: "high",
      user_location: { type: "approximate", approximate: { country: "AU", region: "Queensland", timezone: "Australia/Brisbane" } },
    },
  } as any);

  let parsed: unknown = aiReply;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const reply = parsed as Record<string, unknown>;
    if (Array.isArray(reply.choices)) {
      const first = reply.choices[0];
      const message = first?.message && typeof first.message === "object" ? first.message : null;
      parsed = message?.content ?? null;
    } else if ("response" in reply) {
      parsed = reply.response;
    }
  }
  if (typeof parsed === "string") {
    const match = parsed.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("The meal description could not be analysed");
  const record = parsed as Record<string, unknown>;
  const estimate = parseNutritionEstimate(record);
  const sourceUrl = typeof record.sourceUrl === "string" ? record.sourceUrl : "";
  const normalizedSource = comparableUrl(sourceUrl);
  const citedSource =
    Boolean(normalizedSource) &&
    citedUrls(aiReply).some((citation) => {
      const normalizedCitation = comparableUrl(citation);
      return (
        normalizedCitation === normalizedSource ||
        normalizedCitation.startsWith(`${normalizedSource}?`) ||
        normalizedSource.startsWith(`${normalizedCitation}?`)
      );
    });
  const officialMatch = record.officialMatch === true && citedSource;

  return json({
    estimate: {
      ...estimate,
      serving: cleanText(typeof record.serving === "string" ? record.serving : "", 100),
      confidence: officialMatch ? "high" : estimate.confidence,
    },
    source: officialMatch ? "official_menu" : "text_ai",
    brandOrMenuDetected: record.brandOrMenuDetected === true,
    officialMatch,
    sourceUrl: officialMatch ? sourceUrl : "",
    sourceTitle: officialMatch ? cleanText(typeof record.sourceTitle === "string" ? record.sourceTitle : sourceUrl, 180) : "",
    evidence: officialMatch ? cleanText(typeof record.evidence === "string" ? record.evidence : "Exact official item and serving matched", 280) : "",
    notice: officialMatch
      ? "An exact official source was found. Confirm the menu variant and amount eaten before saving."
      : record.brandOrMenuDetected === true
      ? "A brand or menu item was detected, but no exact official source was verified. This result remains an editable estimate."
      : "This is an editable estimate based on the description and stated portions.",
  });
}

/**
 * Micronutrients Open Food Facts already returns and the app used to discard.
 *
 * The key is the app's own id; the value is the OFF field stem, its ceiling
 * for a plausibility check, and the factor converting the label's unit to the
 * app's. OFF reports every one of these in grams per 100 g regardless of how
 * the pack states it, so milligram and microgram nutrients are scaled here.
 */
const OFF_MICRONUTRIENTS: { id: string; stem: string; factor: number; max: number }[] = [
  { id: "fibre", stem: "fiber", factor: 1, max: 100 },
  { id: "saturatedFat", stem: "saturated-fat", factor: 1, max: 100 },
  { id: "sugars", stem: "sugars", factor: 1, max: 100 },
  { id: "sodium", stem: "sodium", factor: 1000, max: 100 },
  { id: "potassium", stem: "potassium", factor: 1000, max: 100 },
  { id: "calcium", stem: "calcium", factor: 1000, max: 100 },
  { id: "iron", stem: "iron", factor: 1000, max: 1 },
  { id: "magnesium", stem: "magnesium", factor: 1000, max: 10 },
  { id: "zinc", stem: "zinc", factor: 1000, max: 1 },
  { id: "vitaminC", stem: "vitamin-c", factor: 1000, max: 10 },
  { id: "vitaminD", stem: "vitamin-d", factor: 1000000, max: 0.01 },
  { id: "vitaminB12", stem: "vitamin-b12", factor: 1000000, max: 0.001 },
];

/**
 * Read the micronutrients a label declared, per 100 g and per serving.
 *
 * A nutrient the label did not declare is *absent* from the result, never
 * zero. That distinction is the whole feature: a food with no iron figure is
 * not a food with no iron, and adding it up as zero is how every calorie
 * tracker produces a confident daily total that is simply wrong.
 */
function readMicronutrients(
  nutrients: Record<string, unknown>,
  servingQuantity: number | null
): { per100g: Record<string, number>; perServing: Record<string, number> } {
  const per100g: Record<string, number> = {};
  const perServing: Record<string, number> = {};

  for (const micro of OFF_MICRONUTRIENTS) {
    const raw = Number(nutrients[`${micro.stem}_100g`]);
    if (Number.isFinite(raw) && raw >= 0 && raw <= micro.max) {
      per100g[micro.id] = Math.round(raw * micro.factor * 1000) / 1000;
    }

    const declared = Number(nutrients[`${micro.stem}_serving`]);
    if (Number.isFinite(declared) && declared >= 0 && declared <= micro.max * 50) {
      perServing[micro.id] = Math.round(declared * micro.factor * 1000) / 1000;
    } else if (per100g[micro.id] !== undefined && servingQuantity) {
      perServing[micro.id] = Math.round((per100g[micro.id] * servingQuantity) / 100 * 1000) / 1000;
    }
  }

  return { per100g, perServing };
}

async function lookupBarcode(request: Request, env: Env, url: URL): Promise<Response> {
  const keyHash = await nutritionKeyHash(request, env, url);
  if (!keyHash) return json({ error: "Sign in again to look up food" }, 401);
  const code = String(url.searchParams.get("code") || "").replace(/\D/g, "");
  if (code.length < 8 || code.length > 14) return json({ error: "Enter a valid 8–14 digit barcode" }, 400);

  const endpoint = new URL(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`);
  endpoint.searchParams.set("fields", "code,product_name,brands,serving_size,serving_quantity,nutriments,image_front_url,data_quality_errors_tags,last_modified_t");
  const response = await fetch(endpoint, {
    headers: { "User-Agent": "PitchingOS/1.0 (https://dylan-pitching-os.tourmaline-goldfish.workers.dev)" },
  });
  if (!response.ok) return json({ error: "The food database is temporarily unavailable" }, 502);
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return json({ error: "The barcode result was invalid" }, 502);
  const result = payload as Record<string, unknown>;
  if (Number(result.status) !== 1 || !result.product || typeof result.product !== "object" || Array.isArray(result.product)) {
    return json({ found: false, code });
  }

  const product = result.product as Record<string, unknown>;
  const nutrients = product.nutriments && typeof product.nutriments === "object" && !Array.isArray(product.nutriments) ? (product.nutriments as Record<string, unknown>) : {};
  const nutrient = (key: string, maximum: number): number | null => {
    const value = Number(nutrients[key]);
    return Number.isFinite(value) && value >= 0 && value <= maximum ? Math.round(value * 10) / 10 : null;
  };
  const servingQuantity = finiteNumber(product.serving_quantity, 0.1, 5000);
  const per100g = {
    calories: nutrient("energy-kcal_100g", 1000),
    protein: nutrient("proteins_100g", 100),
    carbs: nutrient("carbohydrates_100g", 100),
    fat: nutrient("fat_100g", 100),
  };
  const directServing = {
    calories: nutrient("energy-kcal_serving", 5000),
    protein: nutrient("proteins_serving", 500),
    carbs: nutrient("carbohydrates_serving", 800),
    fat: nutrient("fat_serving", 500),
  };
  const scaledServing = servingQuantity
    ? Object.fromEntries(Object.entries(per100g).map(([name, value]) => [name, value === null ? null : Math.round((value * servingQuantity) / 100)]))
    : null;
  const perServing = Object.values(directServing).some((value) => value !== null) ? directServing : scaledServing;
  const micros = readMicronutrients(nutrients, servingQuantity);

  return json({
    found: true,
    product: {
      code,
      name: cleanText(typeof product.product_name === "string" ? product.product_name : "Packaged food", 120),
      brand: cleanText(typeof product.brands === "string" ? product.brands : "", 100),
      servingSize: cleanText(typeof product.serving_size === "string" ? product.serving_size : "", 60),
      servingQuantity,
      per100g,
      perServing,
      // Absent keys mean the label stayed silent, which the app reports rather
      // than rounding to zero.
      micronutrientsPer100g: micros.per100g,
      micronutrientsPerServing: micros.perServing,
      imageUrl: typeof product.image_front_url === "string" ? product.image_front_url : "",
      dataWarnings: Array.isArray(product.data_quality_errors_tags) ? product.data_quality_errors_tags.slice(0, 8) : [],
      source: "Open Food Facts product label database",
    },
  });
}

async function searchFoodProducts(request: Request, env: Env, url: URL): Promise<Response> {
  const keyHash = await nutritionKeyHash(request, env, url);
  if (!keyHash) return json({ error: "Sign in again to search food" }, 401);
  const query = cleanText(url.searchParams.get("query"), 100);
  if (query.length < 2) return json({ error: "Enter at least two characters" }, 400);

  const endpoint = new URL("https://world.openfoodfacts.org/cgi/search.pl");
  endpoint.searchParams.set("action", "process");
  endpoint.searchParams.set("search_terms", query);
  endpoint.searchParams.set("search_simple", "1");
  endpoint.searchParams.set("json", "1");
  endpoint.searchParams.set("page_size", "8");
  endpoint.searchParams.set("page", "1");
  endpoint.searchParams.set("cc", "au");
  endpoint.searchParams.set("lc", "en");
  endpoint.searchParams.set("fields", "code,product_name,brands,serving_size,serving_quantity,nutriments,image_front_small_url,image_front_url,data_quality_errors_tags");

  const response = await fetch(endpoint, {
    headers: { Accept: "application/json", "User-Agent": "PitchingOS/1.0 (https://dylan-pitching-os.tourmaline-goldfish.workers.dev)" },
  });
  if (!response.ok) {
    return json({ error: response.status === 429 ? "Food search is busy. Wait a minute and try again." : "The food database is temporarily unavailable" }, 502);
  }
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return json({ error: "The food search result was invalid" }, 502);
  const products = Array.isArray((payload as Record<string, unknown>).products) ? ((payload as Record<string, unknown>).products as unknown[]) : [];

  const results = products
    .flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
      const product = candidate as Record<string, unknown>;
      const code = String(product.code || "").replace(/\D/g, "");
      const name = cleanText(typeof product.product_name === "string" ? product.product_name : "", 120);
      if (!code || !name) return [];
      const nutrients = product.nutriments && typeof product.nutriments === "object" && !Array.isArray(product.nutriments) ? (product.nutriments as Record<string, unknown>) : {};
      const nutrient = (key: string, maximum: number): number | null => {
        const value = Number(nutrients[key]);
        return Number.isFinite(value) && value >= 0 && value <= maximum ? Math.round(value * 10) / 10 : null;
      };
      const servingQuantity = finiteNumber(product.serving_quantity, 0.1, 5000);
      const per100g = {
        calories: nutrient("energy-kcal_100g", 1000),
        protein: nutrient("proteins_100g", 100),
        carbs: nutrient("carbohydrates_100g", 100),
        fat: nutrient("fat_100g", 100),
      };
      const directServing = {
        calories: nutrient("energy-kcal_serving", 5000),
        protein: nutrient("proteins_serving", 500),
        carbs: nutrient("carbohydrates_serving", 800),
        fat: nutrient("fat_serving", 500),
      };
      const scaledServing = servingQuantity
        ? Object.fromEntries(Object.entries(per100g).map(([key, value]) => [key, value === null ? null : Math.round((value * servingQuantity) / 100)]))
        : null;
      const perServing = Object.values(directServing).some((value) => value !== null) ? directServing : scaledServing;
      if (![...Object.values(per100g), ...Object.values(perServing || {})].some((value) => value !== null)) return [];
      const micros = readMicronutrients(nutrients, servingQuantity);
      return [
        {
          code,
          name,
          brand: cleanText(typeof product.brands === "string" ? product.brands : "", 100),
          servingSize: cleanText(typeof product.serving_size === "string" ? product.serving_size : "", 60),
          servingQuantity,
          per100g,
          perServing,
          micronutrientsPer100g: micros.per100g,
          micronutrientsPerServing: micros.perServing,
          imageUrl: typeof product.image_front_small_url === "string" ? product.image_front_small_url : typeof product.image_front_url === "string" ? product.image_front_url : "",
          dataWarnings: Array.isArray(product.data_quality_errors_tags) ? product.data_quality_errors_tags.slice(0, 8) : [],
        },
      ];
    })
    .slice(0, 8);

  return json({ query, results, source: "Open Food Facts product label database" });
}

async function lookupRestaurantNutrition(request: Request, env: Env, url: URL): Promise<Response> {
  const keyHash = await nutritionKeyHash(request, env, url);
  if (!keyHash) return json({ error: "Sign in again to search restaurant nutrition" }, 401);
  const restaurant = cleanText(url.searchParams.get("restaurant"), 80);
  const item = cleanText(url.searchParams.get("item"), 120);
  if (restaurant.length < 2 || item.length < 2) return json({ error: "Enter a restaurant and menu item" }, 400);

  const aiReply = await env.AI.run("@cf/google/gemma-4-26b-a4b-it" as any, {
    messages: [
      {
        role: "system",
        content: "Search the web for restaurant nutrition. Use only the restaurant chain's own current page or official nutrition PDF. Never infer a missing nutrient or use a third-party calorie site. Return JSON only.",
      },
      {
        role: "user",
        content: `Find the exact Australian nutrition facts for restaurant ${restaurant}, menu item ${item}. Return {"found":boolean,"name":string,"serving":string,"calories":number|null,"protein":number|null,"carbs":number|null,"fat":number|null,"sourceUrl":string,"sourceTitle":string,"evidence":string}. Return found false when an exact official match is unavailable.`,
      },
    ],
    max_completion_tokens: 700,
    temperature: 0,
    response_format: { type: "json_object" },
    web_search_options: {
      search_context_size: "high",
      user_location: { type: "approximate", approximate: { country: "AU", region: "Queensland", timezone: "Australia/Brisbane" } },
    },
  } as any);

  let parsed: unknown = aiReply;
  let content: unknown = null;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const reply = parsed as Record<string, unknown>;
    if (Array.isArray(reply.choices)) {
      const first = reply.choices[0];
      const message = first?.message && typeof first.message === "object" ? first.message : null;
      content = message?.content ?? null;
    } else if ("response" in reply) {
      content = reply.response;
    }
  }
  if (content !== null) parsed = content;
  if (typeof parsed === "string") {
    const match = parsed.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ found: false, reason: "No exact official result could be verified" });
  const record = parsed as Record<string, unknown>;
  const sourceUrl = typeof record.sourceUrl === "string" ? record.sourceUrl : "";
  const normalizedSource = comparableUrl(sourceUrl);
  const validSource =
    Boolean(normalizedSource) &&
    citedUrls(aiReply).some((citation) => {
      const normalizedCitation = comparableUrl(citation);
      return (
        normalizedCitation === normalizedSource ||
        normalizedCitation.startsWith(`${normalizedSource}?`) ||
        normalizedSource.startsWith(`${normalizedCitation}?`)
      );
    });
  if (record.found !== true || !validSource) return json({ found: false, reason: "No exact official result could be verified" });

  return json({
    found: true,
    result: {
      name: cleanText(typeof record.name === "string" ? record.name : `${restaurant} ${item}`, 140),
      serving: cleanText(typeof record.serving === "string" ? record.serving : "", 80),
      calories: finiteNumber(record.calories, 0, 5000),
      protein: finiteNumber(record.protein, 0, 500),
      carbs: finiteNumber(record.carbs, 0, 800),
      fat: finiteNumber(record.fat, 0, 500),
      confidence: cleanText(typeof record.confidence === "string" ? record.confidence : "medium", 20),
      evidence: cleanText(typeof record.evidence === "string" ? record.evidence : "", 240),
      sourceUrl,
      sourceTitle: cleanText(typeof record.sourceTitle === "string" ? record.sourceTitle : sourceUrl, 160),
    },
  });
}

async function refreshNutritionPhotoUrl(request: Request, env: Env, id: string): Promise<Response> {
  const url = new URL(request.url);
  const keyHash = await nutritionKeyHash(request, env, url);
  if (!keyHash) return json({ error: "Sign in again to manage nutrition data" }, 401);
  if (!privateMediaBucket(env)) return json({ error: "Private media storage is awaiting account activation" }, 503);
  const row = await env.SYNC_DB.prepare("SELECT id FROM meal_photos WHERE id = ?1 AND key_hash = ?2").bind(id, keyHash).first();
  if (!row) return json({ error: "Meal photo not found" }, 404);
  return json({ photoUrl: await privateMediaUrl(`/api/nutrition/photos/${encodeURIComponent(id)}/content`, id, keyHash, env) });
}

async function deleteNutritionPhoto(request: Request, env: Env, id: string): Promise<Response> {
  const url = new URL(request.url);
  const keyHash = await nutritionKeyHash(request, env, url);
  if (!keyHash) return json({ error: "Sign in again to manage nutrition data" }, 401);
  const row = await env.SYNC_DB.prepare("SELECT object_key FROM meal_photos WHERE id = ?1 AND key_hash = ?2").bind(id, keyHash).first<{ object_key: string }>();
  if (!row) return json({ error: "Meal photo not found" }, 404);
  const mediaBucket = privateMediaBucket(env);
  if (!mediaBucket) return json({ error: "Private media storage is awaiting account activation" }, 503);
  await mediaBucket.delete(row.object_key);
  await env.SYNC_DB.prepare("DELETE FROM meal_photos WHERE id = ?1 AND key_hash = ?2").bind(id, keyHash).run();
  return json({ deleted: true });
}

// -- Account (Google sign-in + passkeys via better-auth) ----------------------

async function accountSession(request: Request, env: Env, url: URL) {
  const auth = createAuth(env, applicationOrigin(env, url));
  return auth.api.getSession({ headers: request.headers });
}

async function accountStatus(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await accountSession(request, env, url);
  if (!session) return json({ signedIn: false, workspaceReady: false });
  const workspace = await env.SYNC_DB.prepare("SELECT wrapped_sync_key, updated_at FROM account_workspaces WHERE user_id = ?1")
    .bind(session.user.id)
    .first<{ wrapped_sync_key: string; updated_at: string }>();
  return json({
    signedIn: true,
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image || "",
    },
    workspaceReady: Boolean(workspace),
    syncKey: workspace ? await unwrapWorkspaceKey(workspace.wrapped_sync_key, env) : "",
    updatedAt: workspace?.updated_at || "",
  });
}

async function createAccountWorkspace(request: Request, env: Env, url: URL): Promise<Response> {
  const blocked = requireSameOrigin(request, url, env);
  if (blocked) return blocked;
  const session = await accountSession(request, env, url);
  if (!session) return json({ error: "Sign in is required" }, 401);

  const existing = await env.SYNC_DB.prepare("SELECT wrapped_sync_key, updated_at FROM account_workspaces WHERE user_id = ?1")
    .bind(session.user.id)
    .first<{ wrapped_sync_key: string; updated_at: string }>();
  if (existing) {
    return json({
      workspaceReady: true,
      syncKey: await unwrapWorkspaceKey(existing.wrapped_sync_key, env),
      adoptedExistingData: false,
      updatedAt: existing.updated_at,
    });
  }

  const body = await request.json().catch(() => ({}));
  const legacyCandidate =
    body && typeof body === "object" && !Array.isArray(body)
      ? String((body as Record<string, unknown>).legacySyncKey || "")
          .replace(/[^a-f0-9]/gi, "")
          .toLowerCase()
      : "";
  if (legacyCandidate && !SYNC_KEY_PATTERN.test(legacyCandidate)) {
    return json({ error: "The existing recovery key is invalid" }, 400);
  }

  const syncKey = legacyCandidate || randomHex();
  const keyHash = await sha256Hex(`pitching-os-sync-v1:${syncKey}`);
  const owner = await env.SYNC_DB.prepare("SELECT user_id FROM account_workspaces WHERE key_hash = ?1").bind(keyHash).first<{ user_id: string }>();
  if (owner && owner.user_id !== session.user.id) {
    return json({ error: "That saved workspace already belongs to another account" }, 409);
  }

  const now = new Date().toISOString();
  const wrappedSyncKey = await wrapWorkspaceKey(syncKey, env);
  await env.SYNC_DB.prepare(
    `INSERT INTO account_workspaces (user_id, key_hash, wrapped_sync_key, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?4)`
  )
    .bind(session.user.id, keyHash, wrappedSyncKey, now)
    .run();

  return json({ workspaceReady: true, syncKey, adoptedExistingData: Boolean(legacyCandidate), updatedAt: now }, 201);
}

async function deleteAccount(request: Request, env: Env, url: URL): Promise<Response> {
  const blocked = requireSameOrigin(request, url, env);
  if (blocked) return blocked;
  const session = await accountSession(request, env, url);
  if (!session?.user?.id) return json({ error: "Sign in is required" }, 401);

  const workspace = await env.SYNC_DB.prepare("SELECT key_hash FROM account_workspaces WHERE user_id = ?1")
    .bind(session.user.id)
    .first<{ key_hash: string }>();
  if (workspace?.key_hash) {
    const mediaRows = await env.SYNC_DB.prepare(
      `SELECT object_key FROM mechanics_videos WHERE key_hash = ?1
       UNION ALL
       SELECT object_key FROM meal_photos WHERE key_hash = ?1`
    )
      .bind(workspace.key_hash)
      .all<{ object_key: string }>();
    if (mediaRows.results?.length) {
      await privateMediaBucket(env).delete(mediaRows.results.map((row) => row.object_key));
    }
    await env.SYNC_DB.batch([
      env.SYNC_DB.prepare("DELETE FROM sync_snapshots WHERE key_hash = ?1").bind(workspace.key_hash),
      env.SYNC_DB.prepare("DELETE FROM oauth_states WHERE key_hash = ?1").bind(workspace.key_hash),
      env.SYNC_DB.prepare("DELETE FROM oauth_connections WHERE key_hash = ?1").bind(workspace.key_hash),
      env.SYNC_DB.prepare("DELETE FROM apple_health_connections WHERE key_hash = ?1").bind(workspace.key_hash),
      env.SYNC_DB.prepare("DELETE FROM health_daily WHERE key_hash = ?1").bind(workspace.key_hash),
      env.SYNC_DB.prepare("DELETE FROM training_history_events WHERE key_hash = ?1").bind(workspace.key_hash),
      env.SYNC_DB.prepare("DELETE FROM mechanics_videos WHERE key_hash = ?1").bind(workspace.key_hash),
      env.SYNC_DB.prepare("DELETE FROM meal_photos WHERE key_hash = ?1").bind(workspace.key_hash),
    ]);
  }
  await env.SYNC_DB.batch([
    env.SYNC_DB.prepare("DELETE FROM passkey WHERE userId = ?1").bind(session.user.id),
    env.SYNC_DB.prepare("DELETE FROM account WHERE userId = ?1").bind(session.user.id),
    env.SYNC_DB.prepare('DELETE FROM "session" WHERE userId = ?1').bind(session.user.id),
    env.SYNC_DB.prepare("DELETE FROM account_workspaces WHERE user_id = ?1").bind(session.user.id),
    env.SYNC_DB.prepare('DELETE FROM "user" WHERE id = ?1').bind(session.user.id),
  ]);
  return json({ deleted: true });
}

// -- Router -------------------------------------------------------------------

async function routeApi(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname === "/api/health" && request.method === "GET") {
    await env.SYNC_DB.prepare("SELECT 1").first();
    // Audit fix: this endpoint is unauthenticated by design (used for uptime
    // checks), so it must not report which third-party integrations are
    // configured. That detail is available, authenticated, via
    // /api/integrations/oura/status.
    return json({ ok: true });
  }
  if (url.pathname === "/api/sync") {
    const blocked = requireSameOrigin(request, url, env);
    if (blocked) return blocked;
    return handleSync(request, env);
  }
  if (url.pathname === "/api/history") return handleTrainingHistory(request, env, url);
  if (url.pathname === "/api/share" || url.pathname.startsWith("/api/share/")) {
    // A physio opening a link is cross-origin by nature — they are following a
    // URL, not using the app — so only the writing routes are same-origin
    // guarded. Reading is guarded by the id itself.
    const writing = request.method !== "GET";
    const blocked = writing ? requireSameOrigin(request, url, env) : null;
    const limited = blocked
      ? null
      : await enforceAccountRateLimit(request, env, url, env.INTEGRATION_RATE_LIMITER, "share");
    return blocked || limited || handleShares(request, env, url);
  }
  if (url.pathname === "/api/account/status" && request.method === "GET") {
    return accountStatus(request, env, url);
  }
  if (url.pathname === "/api/account/workspace" && request.method === "POST") {
    return createAccountWorkspace(request, env, url);
  }
  if (url.pathname === "/api/account" && request.method === "DELETE") {
    return deleteAccount(request, env, url);
  }
  if (url.pathname === "/api/integrations/oura/callback" && request.method === "GET") {
    return handleOuraCallback(request, env, url);
  }
  if (url.pathname === "/api/integrations/oura/status" && request.method === "GET") return ouraStatus(request, env);
  if (url.pathname === "/api/integrations/oura/connect" && request.method === "POST") {
    const blocked = requireSameOrigin(request, url, env);
    const limited = blocked ? null : await enforceAccountRateLimit(request, env, url, env.INTEGRATION_RATE_LIMITER, "oura-connect");
    return blocked || limited || beginOuraOAuth(request, env, url);
  }
  if (url.pathname === "/api/integrations/oura" && request.method === "DELETE") {
    const blocked = requireSameOrigin(request, url, env);
    return blocked || disconnectOura(request, env);
  }
  if (url.pathname === "/api/integrations/apple/status" && request.method === "GET") return appleStatus(request, env);
  if (url.pathname === "/api/integrations/apple/setup" && request.method === "POST") {
    const blocked = requireSameOrigin(request, url, env);
    return blocked || createAppleUploadToken(request, env, url);
  }
  if (url.pathname === "/api/integrations/apple/ingest" && request.method === "POST") {
    const limited = await enforceIngestRateLimit(request, env);
    return limited || ingestAppleHealth(request, env);
  }
  if (url.pathname === "/api/integrations/apple" && request.method === "DELETE") {
    const blocked = requireSameOrigin(request, url, env);
    return blocked || disconnectAppleHealth(request, env);
  }
  if (url.pathname === "/api/integrations/daily" && request.method === "GET") return dailyHealth(request, env, url);
  if (url.pathname === "/api/integrations/history" && request.method === "GET") return healthHistory(request, env, url);
  if (url.pathname === "/api/mechanics/videos" && request.method === "GET") return listMechanicsVideos(request, env);
  if (url.pathname === "/api/mechanics/analyze" && request.method === "POST") {
    const blocked = requireSameOrigin(request, url, env);
    const limited = blocked ? null : await enforceAccountRateLimit(request, env, url, env.AI_RATE_LIMITER, "mechanics");
    return blocked || limited || analyzeMechanicsContactSheet(request, env, url);
  }
  const mechanicsMatch = /^\/api\/mechanics\/videos\/([a-zA-Z0-9_-]{12,80})(?:\/(content))?$/.exec(url.pathname);
  if (mechanicsMatch) {
    const id = mechanicsMatch[1];
    if (mechanicsMatch[2] === "content" && request.method === "GET") return privateMediaContent(env, url, id, "mechanics", request);
    const blocked = requireSameOrigin(request, url, env);
    if (blocked) return blocked;
    if (request.method === "PUT") return uploadMechanicsVideo(request, env, url, id);
    if (request.method === "DELETE") return deleteMechanicsVideo(request, env, id);
  }
  if (url.pathname === "/api/session-photos" && request.method === "GET") return listSessionPhotos(request, env);
  const sessionPhotoMatch = /^\/api\/session-photos\/(\d{4}-\d{2}-\d{2})$/.exec(url.pathname);
  if (sessionPhotoMatch) {
    const day = sessionPhotoMatch[1];
    // The photo is read with the bearer key, so a GET needs no origin check —
    // but anything that writes does.
    if (request.method === "GET") return sessionPhotoContent(request, env, day);
    const blocked = requireSameOrigin(request, url, env);
    if (blocked) return blocked;
    if (request.method === "PUT") return uploadSessionPhoto(request, env, day);
    if (request.method === "DELETE") return deleteSessionPhoto(request, env, day);
  }
  if (url.pathname === "/api/nutrition/analyze" && request.method === "POST") {
    const blocked = requireSameOrigin(request, url, env);
    const limited = blocked ? null : await enforceAccountRateLimit(request, env, url, env.AI_RATE_LIMITER, "meal-photo");
    return blocked || limited || analyzeMealPhoto(request, env, url);
  }
  if (url.pathname === "/api/nutrition/text" && request.method === "POST") {
    const blocked = requireSameOrigin(request, url, env);
    const limited = blocked ? null : await enforceAccountRateLimit(request, env, url, env.AI_RATE_LIMITER, "meal-text");
    return blocked || limited || analyzeMealText(request, env, url);
  }
  if (url.pathname === "/api/nutrition/barcode" && request.method === "GET") return lookupBarcode(request, env, url);
  if (url.pathname === "/api/nutrition/search" && request.method === "GET") return searchFoodProducts(request, env, url);
  if (url.pathname === "/api/nutrition/restaurant" && request.method === "GET") return lookupRestaurantNutrition(request, env, url);
  const nutritionMatch = /^\/api\/nutrition\/photos\/([a-zA-Z0-9_-]{12,80})(?:\/(content))?$/.exec(url.pathname);
  if (nutritionMatch) {
    const id = nutritionMatch[1];
    if (nutritionMatch[2] === "content" && request.method === "GET") return privateMediaContent(env, url, id, "nutrition", request);
    const blocked = requireSameOrigin(request, url, env);
    if (blocked) return blocked;
    if (request.method === "GET") return refreshNutritionPhotoUrl(request, env, id);
    if (request.method === "DELETE") return deleteNutritionPhoto(request, env, id);
  }
  if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
  return null;
}


/**
 * Static assets, with a missing file treated as missing.
 *
 * The Assets binding used to be configured with
 * `not_found_handling: "single-page-application"`, which answers *every*
 * unknown path with the root index.html and a 200. That is convenient for
 * client-side routing and dangerous for everything else: a deploy that
 * dropped the React app served the old shell, with a 200, for
 * `/next/assets/index-*.js` as well as for `/next/` itself. Nothing failed.
 * The browser simply ran a different application, and it took reading the
 * Cloudflare deployment history to work out why.
 *
 * So the fallback is done here instead, where the two cases can be told
 * apart. A path that names a file is a file: if it is not there, that is a
 * 404, and a broken deploy announces itself. A path with no extension is a
 * route, and gets the shell that owns it — `/next/` routes get the React
 * shell rather than the prototype, which is the same distinction the service
 * worker makes offline.
 */
/**
 * Read-only shares, for a physio.
 *
 * The payload is ciphertext this Worker cannot read: it is encrypted in the
 * athlete's browser under a key that travels only in a URL fragment, so it
 * never reaches here. All this does is store a blob under a random id and
 * hand it back to whoever has the id.
 *
 * That id is the entire read capability, which is why there is no route that
 * writes to a workspace through a share. Read-only is a property of what
 * exists, not a promise.
 */
async function ensureShareTable(env: Env): Promise<void> {
  // Created here for the same reason the rate-limit table is: the credentials
  // that deploy this Worker cannot run D1 migrations, so a deploy would
  // otherwise ship a feature that fails until someone remembers a manual step.
  // Additive, idempotent, once per database. migrations/0007 is the record.
  await env.SYNC_DB.prepare(
    `CREATE TABLE IF NOT EXISTS physio_shares (
       share_id TEXT PRIMARY KEY,
       key_hash TEXT NOT NULL,
       payload TEXT NOT NULL CHECK (length(payload) BETWEEN 16 AND 400000),
       label TEXT NOT NULL DEFAULT '',
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       expires_at TEXT NOT NULL
     ) STRICT`
  ).run();
  await env.SYNC_DB.prepare(
    "CREATE INDEX IF NOT EXISTS physio_shares_owner_idx ON physio_shares (key_hash, created_at DESC)"
  ).run();
}

async function handleShares(request: Request, env: Env, url: URL): Promise<Response> {
  await ensureShareTable(env);
  const parts = url.pathname.split("/").filter(Boolean); // api, share, [id]
  const shareId = parts[2] ?? "";

  // --- Reading one. The only unauthenticated route, deliberately: the id is
  // the capability, and it is 128 bits of randomness.
  if (request.method === "GET" && shareId) {
    if (!SHARE_ID_PATTERN.test(shareId)) return json({ error: "Not found" }, 404);
    const row = await env.SYNC_DB.prepare(
      "SELECT payload, updated_at, expires_at FROM physio_shares WHERE share_id = ?1"
    )
      .bind(shareId)
      .first<{ payload: string; updated_at: string; expires_at: string }>();
    if (!row) return json({ error: "This link is no longer active." }, 404);
    if (Date.parse(row.expires_at) < Date.now()) {
      return json({ error: "This link has expired. Ask for a new one." }, 410);
    }
    return json({ payload: row.payload, updatedAt: row.updated_at });
  }

  const keyHash = await recoveryKeyHash(request);
  if (!keyHash) return json({ error: "Cloud autosave recovery key required" }, 401);

  // --- Listing your own, so they can be seen and revoked.
  if (request.method === "GET") {
    const rows = await env.SYNC_DB.prepare(
      "SELECT share_id, label, created_at, updated_at, expires_at FROM physio_shares WHERE key_hash = ?1 ORDER BY created_at DESC LIMIT 20"
    )
      .bind(keyHash)
      .all<{ share_id: string; label: string; created_at: string; updated_at: string; expires_at: string }>();
    return json({
      shares: (rows.results ?? []).map((row) => ({
        id: row.share_id,
        label: row.label,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        expiresAt: row.expires_at,
      })),
    });
  }

  // --- Creating or refreshing. Refreshing is what keeps a physio current
  // without the athlete having to send a new link every week.
  if (request.method === "PUT") {
    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength > MAX_SHARE_PAYLOAD_BYTES + 10_000) {
      return json({ error: "Share payload is too large" }, 413);
    }
    const body = (await request.json().catch(() => null)) as
      | { id?: unknown; payload?: unknown; label?: unknown }
      | null;
    const id = String(body?.id ?? "");
    const payload = String(body?.payload ?? "");
    if (!SHARE_ID_PATTERN.test(id)) return json({ error: "Invalid share id" }, 400);
    if (payload.length < 16 || payload.length > MAX_SHARE_PAYLOAD_BYTES) {
      return json({ error: "Invalid share payload" }, 400);
    }
    const label = cleanText(body?.label, 60);
    const now = new Date();
    const expires = new Date(now.getTime() + SHARE_LIFETIME_DAYS * 86_400_000);

    // A share belongs to whoever created it: the WHERE clause on update means
    // one athlete cannot overwrite another's share by guessing an id.
    await env.SYNC_DB.prepare(
      `INSERT INTO physio_shares (share_id, key_hash, payload, label, created_at, updated_at, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6)
       ON CONFLICT(share_id) DO UPDATE SET
         payload = excluded.payload,
         label = excluded.label,
         updated_at = excluded.updated_at,
         expires_at = excluded.expires_at
       WHERE physio_shares.key_hash = ?2`
    )
      .bind(id, keyHash, payload, label, now.toISOString(), expires.toISOString())
      .run();

    const saved = await env.SYNC_DB.prepare(
      "SELECT share_id FROM physio_shares WHERE share_id = ?1 AND key_hash = ?2"
    )
      .bind(id, keyHash)
      .first<{ share_id: string }>();
    if (!saved) return json({ error: "That share belongs to another workspace." }, 409);

    return json({ id, expiresAt: expires.toISOString(), updatedAt: now.toISOString() });
  }

  if (request.method === "DELETE" && shareId) {
    if (!SHARE_ID_PATTERN.test(shareId)) return json({ error: "Invalid share id" }, 400);
    await env.SYNC_DB.prepare("DELETE FROM physio_shares WHERE share_id = ?1 AND key_hash = ?2")
      .bind(shareId, keyHash)
      .run();
    return json({ revoked: true });
  }

  return json({ error: "Method not allowed" }, 405);
}

/**
 * Send the front door to the app the athlete is actually meant to use.
 *
 * Two applications are served here: the original prototype at `/`, frozen at
 * v60, and the rebuilt app at `/next/`. Everything built since — recovery
 * trends, progress charts, the movement plot, micronutrients, the automatic
 * delivery analysis, game import, Apple Health setup — exists only in the
 * second one. The prototype contains no link to it whatsoever, and the PWA
 * manifest pointed `start_url` at `/`.
 *
 * So opening the site, or the installed app, gave the old one. Work would be
 * deployed and verified live and the athlete would still be looking at a build
 * from before any of it, with nothing to indicate there was anywhere else to
 * go. It read as the app having reverted, or as a feature never shipping.
 *
 * `/` now sends a browser to `/next/`. The prototype is still there and still
 * served — `/?legacy=1` reaches it, and nothing has been deleted — because it
 * is the fallback if the rebuilt app ever cannot start, and because the
 * migration path reads its stored data.
 *
 * The query string is carried across rather than dropped: the Oura callback
 * comes back to the origin with `?oura=connected` on it.
 */
function redirectToApp(request: Request, url: URL): Response | null {
  if (url.pathname !== "/") return null;
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  // An explicit request for the prototype is honoured.
  if (url.searchParams.has("legacy")) return null;
  // Only a browser asking for a page; never a fetch, a probe or an asset.
  if (!(request.headers.get("Accept") || "").includes("text/html")) return null;

  const target = new URL("/next/", url.origin);
  target.search = url.search;
  return Response.redirect(target.toString(), 302);
}

async function serveAsset(request: Request, env: Env, url: URL): Promise<Response> {
  const redirect = redirectToApp(request, url);
  if (redirect) return redirect;

  const direct = await env.ASSETS.fetch(request);
  if (direct.status !== 404) return direct;

  // Anything with a file extension was asking for a file, not a route.
  if (/\.[a-z0-9]+$/i.test(url.pathname)) return direct;

  // Only a navigation should be answered with a document.
  const wantsHtml = (request.headers.get("Accept") || "").includes("text/html");
  if (!wantsHtml || (request.method !== "GET" && request.method !== "HEAD")) return direct;

  const shell = url.pathname === "/next" || url.pathname.startsWith("/next/")
    ? "/next/index.html"
    : "/index.html";
  const shellResponse = await env.ASSETS.fetch(new URL(shell, url.origin));
  if (shellResponse.status === 404) return direct;
  return new Response(shellResponse.body, {
    status: 200,
    headers: shellResponse.headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/auth/")) {
        return createAuth(env, applicationOrigin(env, url)).handler(request);
      }

      const apiResponse = await routeApi(request, env, url);
      if (apiResponse) return apiResponse;

      // Audit fix: Cache-Control for every static path (including the
      // always-fresh HTML shell/service worker vs. the long-lived,
      // ?v=-versioned app.js/styles.css/etc.) is set via public/_headers.
      // Cloudflare serves static-asset-shaped requests directly from the
      // Assets binding without invoking this fetch handler, so header
      // rewrites attempted here never actually run for those requests —
      // _headers is the mechanism that does.
      return serveAsset(request, env, url);
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "request failed",
          path: url.pathname,
          method: request.method,
          error: error instanceof Error ? error.message : String(error),
        })
      );
      return json({ error: "Service unavailable" }, 500);
    }
  },
};
