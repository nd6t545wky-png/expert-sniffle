/**
 * Web Push, implemented rather than imported.
 *
 * This was the one item on the gap list marked permanently blocked: push needs
 * a VAPID keypair, VAPID keys are normally Worker secrets, and the deploy token
 * this project has cannot write secrets. The block was in the *storage*, not
 * the feature — so the Worker generates its own keypair on first use and keeps
 * the private half in the R2 bucket it already writes to. Nothing has to be
 * set by hand, and the key never leaves the server.
 *
 * Everything below is RFC 8291 (message encryption) and RFC 8292 (VAPID), on
 * WebCrypto alone. No library, because the two that exist both assume Node's
 * crypto module and neither runs on Workers unmodified.
 *
 * The shape of a push, end to end:
 *
 *   1. The browser hands over a subscription: an endpoint URL, the user
 *      agent's P-256 public key, and a 16-byte auth secret.
 *   2. The payload is encrypted to that public key with a fresh ephemeral
 *      keypair, so the push service moves ciphertext it cannot read.
 *   3. A short-lived JWT signed with the VAPID private key identifies this
 *      server to the push service.
 *
 * The encryption is not decoration. Without it the notification text — what
 * the athlete trained, how they slept — would sit in a third party's queue in
 * the clear.
 */

// --- base64url ---------------------------------------------------------------

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const utf8 = (value: string) => new TextEncoder().encode(value);

// --- HKDF --------------------------------------------------------------------

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const imported = await crypto.subtle.importKey(
    "raw",
    key as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", imported, data as unknown as BufferSource));
}

/**
 * One round of HKDF, which is all RFC 8291 ever needs.
 *
 * Every output here is 32 bytes or fewer, so the expand step is a single HMAC
 * with a 0x01 counter rather than the general loop.
 */
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm);
  const okm = await hmac(prk, concat(info, new Uint8Array([1])));
  return okm.slice(0, length);
}

// --- Keys --------------------------------------------------------------------

export interface VapidKeys {
  /** base64url of the raw 65-byte uncompressed public point. */
  publicKey: string;
  /** base64url of the PKCS#8 private key. */
  privateKey: string;
}

/** A fresh VAPID keypair. Generated once, then kept. */
export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const privateKey = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  return { publicKey: toBase64Url(publicKey), privateKey: toBase64Url(privateKey) };
}

/**
 * The VAPID authorisation header for one push.
 *
 * The audience is the push service's *origin* and nothing more — sending the
 * full endpoint would hand the service a token scoped to a URL it can replay,
 * and every push service rejects it anyway.
 */
export async function vapidHeader(
  keys: VapidKeys,
  endpoint: string,
  subject: string,
  now = Date.now()
): Promise<string> {
  const audience = new URL(endpoint).origin;
  const header = toBase64Url(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = toBase64Url(
    utf8(
      JSON.stringify({
        aud: audience,
        // Twelve hours. The spec caps it at 24; shorter limits the damage if a
        // token is ever captured in transit.
        exp: Math.floor(now / 1000) + 12 * 60 * 60,
        sub: subject,
      })
    )
  );

  const signingKey = await crypto.subtle.importKey(
    "pkcs8",
    fromBase64Url(keys.privateKey) as unknown as BufferSource,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      signingKey,
      utf8(`${header}.${claims}`) as unknown as BufferSource
    )
  );

  return `vapid t=${header}.${claims}.${toBase64Url(signature)}, k=${keys.publicKey}`;
}

// --- Payload encryption (RFC 8291, aes128gcm) --------------------------------

export interface PushSubscription {
  endpoint: string;
  keys: {
    /** The user agent's P-256 public key, base64url. */
    p256dh: string;
    /** The 16-byte authentication secret, base64url. */
    auth: string;
  };
}

/** Record size. 4096 is what every browser accepts and no payload here nears. */
const RECORD_SIZE = 4096;

/**
 * Encrypt a payload to a subscription.
 *
 * `salt` and `ephemeral` are injectable so the tests can pin them; in
 * production both are fresh per message, which is what makes the same text
 * encrypt differently every time.
 */
export async function encryptPayload(
  subscription: PushSubscription,
  payload: string,
  options: { salt?: Uint8Array; ephemeral?: CryptoKeyPair } = {}
): Promise<Uint8Array> {
  const userPublic = fromBase64Url(subscription.keys.p256dh);
  const authSecret = fromBase64Url(subscription.keys.auth);
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16));

  const ephemeral =
    options.ephemeral ??
    ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
      "deriveBits",
    ])) as CryptoKeyPair);

  const ephemeralPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));

  const userKey = await crypto.subtle.importKey(
    "raw",
    userPublic as unknown as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: userKey }, ephemeral.privateKey, 256)
  );

  // The key-derivation info binds both public keys into the material, so a
  // message encrypted for one subscriber cannot be replayed at another.
  const keyInfo = concat(
    utf8("WebPush: info"),
    new Uint8Array([0]),
    userPublic,
    ephemeralPublic
  );
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);

  const cek = await hkdf(salt, ikm, concat(utf8("Content-Encoding: aes128gcm"), new Uint8Array([0])), 16);
  const nonce = await hkdf(salt, ikm, concat(utf8("Content-Encoding: nonce"), new Uint8Array([0])), 12);

  const aesKey = await crypto.subtle.importKey(
    "raw",
    cek as unknown as BufferSource,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  // 0x02 is the record's padding delimiter for a final record. Omitting it is
  // the classic mistake here: every browser rejects the message and the push
  // service still reports a 201.
  const plaintext = concat(utf8(payload), new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce as unknown as BufferSource },
      aesKey,
      plaintext as unknown as BufferSource
    )
  );

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, RECORD_SIZE, false);

  return concat(
    salt,
    recordSize,
    new Uint8Array([ephemeralPublic.length]),
    ephemeralPublic,
    ciphertext
  );
}

/** Everything needed to make the HTTP request to a push service. */
export interface PushRequest {
  endpoint: string;
  headers: Record<string, string>;
  body: Uint8Array;
}

export async function buildPushRequest(
  keys: VapidKeys,
  subscription: PushSubscription,
  payload: string,
  options: { subject?: string; ttlSeconds?: number; now?: number } = {}
): Promise<PushRequest> {
  const body = await encryptPayload(subscription, payload);
  return {
    endpoint: subscription.endpoint,
    headers: {
      Authorization: await vapidHeader(
        keys,
        subscription.endpoint,
        options.subject ?? "mailto:noreply@example.com",
        options.now
      ),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(options.ttlSeconds ?? 24 * 60 * 60),
      Urgency: "normal",
    },
    body,
  };
}

/** A subscription read defensively out of stored JSON. */
export function readSubscription(value: unknown): PushSubscription | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as PushSubscription;
  if (typeof candidate.endpoint !== "string" || !/^https:\/\//.test(candidate.endpoint)) return null;
  const keys = candidate.keys;
  if (typeof keys !== "object" || keys === null) return null;
  if (typeof keys.p256dh !== "string" || typeof keys.auth !== "string") return null;
  try {
    // A malformed key would fail later inside the crypto, where the error is
    // opaque. Better to reject it at the door.
    if (fromBase64Url(keys.p256dh).length !== 65) return null;
    if (fromBase64Url(keys.auth).length !== 16) return null;
  } catch {
    return null;
  }
  return { endpoint: candidate.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

/**
 * Whether a push service's reply means the subscription is dead.
 *
 * 404 and 410 are the two that do. Anything else is a transient failure and
 * must not delete a working subscription — a push service having a bad minute
 * is not the athlete unsubscribing.
 */
export function isGone(status: number): boolean {
  return status === 404 || status === 410;
}
