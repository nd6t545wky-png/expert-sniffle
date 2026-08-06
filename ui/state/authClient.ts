/**
 * better-auth client wrapper: Google sign-in, passkeys, sign-out.
 *
 * The server mounts better-auth at /api/auth/*, so this drives those routes
 * directly rather than pulling the full client bundle into the rebuild. The
 * WebAuthn ceremony itself is performed by the browser — a passkey's private
 * key never leaves the device and is never sent to the server.
 */

export interface Passkey {
  id: string;
  name?: string;
  createdAt?: string;
}

const AUTH_BASE = "/api/auth";

async function authFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${AUTH_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers as Record<string, string>) },
    credentials: "same-origin",
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    throw new Error(body?.message || body?.error || `Auth request failed (${response.status})`);
  }
  return body as T;
}

/** Whether this browser can do platform authenticators at all. */
export function passkeysSupported(): boolean {
  return typeof window !== "undefined" && "PublicKeyCredential" in window;
}

export function signInWithGoogle(): void {
  // Full-page redirect: the provider will bounce back to the app.
  window.location.href = `${AUTH_BASE}/sign-in/google`;
}

export async function signOut(): Promise<void> {
  await authFetch("/sign-out", { method: "POST", body: "{}" });
}

export async function listPasskeys(): Promise<Passkey[]> {
  const result = await authFetch<{ data?: Passkey[] } | Passkey[]>("/passkey/list-user-passkeys");
  if (Array.isArray(result)) return result;
  return Array.isArray(result?.data) ? result.data : [];
}

function base64UrlToBuffer(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return bytes.buffer;
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/**
 * Register a new passkey for the signed-in user.
 * Requires an existing session — sign in with Google first.
 */
export async function registerPasskey(): Promise<void> {
  if (!passkeysSupported()) throw new Error("This browser does not support passkeys.");

  const options = await authFetch<Record<string, never>>("/passkey/generate-register-options", {
    method: "POST",
    body: "{}",
  });

  // better-auth returns the WebAuthn options with challenge/user.id/credential
  // ids as base64url strings; the browser API wants ArrayBuffers.
  const publicKey = options as unknown as Omit<
    PublicKeyCredentialCreationOptions,
    "challenge" | "user" | "excludeCredentials"
  > & {
    challenge: string;
    user: PublicKeyCredentialUserEntity & { id: string };
    excludeCredentials?: { id: string }[];
  };

  const credential = (await navigator.credentials.create({
    publicKey: {
      ...publicKey,
      challenge: base64UrlToBuffer(publicKey.challenge),
      user: { ...publicKey.user, id: base64UrlToBuffer(publicKey.user.id) },
      excludeCredentials: (publicKey.excludeCredentials ?? []).map((item) => ({
        ...item,
        id: base64UrlToBuffer(item.id),
        type: "public-key" as const,
      })),
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error("Passkey registration was cancelled.");
  const attestation = credential.response as AuthenticatorAttestationResponse;

  await authFetch("/passkey/verify-registration", {
    method: "POST",
    body: JSON.stringify({
      id: credential.id,
      rawId: bufferToBase64Url(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: bufferToBase64Url(attestation.clientDataJSON),
        attestationObject: bufferToBase64Url(attestation.attestationObject),
      },
    }),
  });
}

/** Sign in using an existing passkey. */
export async function signInWithPasskey(): Promise<void> {
  if (!passkeysSupported()) throw new Error("This browser does not support passkeys.");

  const options = await authFetch<{ challenge: string; allowCredentials?: { id: string }[] }>(
    "/passkey/generate-authenticate-options",
    { method: "POST", body: "{}" }
  );

  const request = options as unknown as Omit<
    PublicKeyCredentialRequestOptions,
    "challenge" | "allowCredentials"
  > & { challenge: string; allowCredentials?: { id: string }[] };

  const credential = (await navigator.credentials.get({
    publicKey: {
      ...request,
      challenge: base64UrlToBuffer(request.challenge),
      allowCredentials: (request.allowCredentials ?? []).map((item) => ({
        ...item,
        id: base64UrlToBuffer(item.id),
        type: "public-key" as const,
      })),
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error("Passkey sign-in was cancelled.");
  const assertion = credential.response as AuthenticatorAssertionResponse;

  await authFetch("/passkey/verify-authentication", {
    method: "POST",
    body: JSON.stringify({
      id: credential.id,
      rawId: bufferToBase64Url(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: bufferToBase64Url(assertion.clientDataJSON),
        authenticatorData: bufferToBase64Url(assertion.authenticatorData),
        signature: bufferToBase64Url(assertion.signature),
        userHandle: assertion.userHandle ? bufferToBase64Url(assertion.userHandle) : undefined,
      },
    }),
  });
}

export async function deletePasskey(id: string): Promise<void> {
  await authFetch("/passkey/delete-passkey", { method: "POST", body: JSON.stringify({ id }) });
}
