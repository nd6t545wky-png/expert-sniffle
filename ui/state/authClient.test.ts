/**
 * Starting Google sign-in.
 *
 * This module had a bug worth a test of its own: it navigated the whole page
 * to `/api/auth/sign-in/google`, a route better-auth does not serve. The
 * request 404'd with an empty body, so the button led to a blank page and no
 * request ever reached Google.
 *
 * Nothing in the app could have caught that — the mistake was in the URL
 * itself, and a mock that answers every path would have passed. So the fetch
 * stub below answers exactly the one route better-auth actually mounts and
 * 404s everything else, the same way the deployed Worker does.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { signInWithGoogle, signOut } from "./authClient";

/** Where the browser was sent, without jsdom trying to navigate. */
function trackLocation(href = "https://app.test/next/") {
  const url = new URL(href);
  const location = {
    href: url.href,
    origin: url.origin,
    pathname: url.pathname,
    hash: url.hash,
    search: url.search,
  };
  Object.defineProperty(window, "location", { configurable: true, value: location });
  return location;
}

/**
 * The routes better-auth serves, and nothing else.
 *
 * `/sign-in/social` is a POST that answers with the provider's authorization
 * URL; there is no per-provider GET. Anything else is a 404 with no body,
 * which is exactly what the Worker returned for the old URL.
 */
function authServer(calls: { path: string; method: string; body: unknown }[]) {
  return vi.fn(async (input: string, init: RequestInit = {}) => {
    const path = String(input);
    const method = init.method ?? "GET";
    calls.push({ path, method, body: init.body ? JSON.parse(String(init.body)) : undefined });

    if (path === "/api/auth/sign-in/social" && method === "POST") {
      return new Response(
        JSON.stringify({ url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=x", redirect: true }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (path === "/api/auth/sign-out" && method === "POST") {
      return new Response("{}", { status: 200 });
    }
    return new Response("", { status: 404 });
  }) as unknown as typeof fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe("google sign-in", () => {
  it("asks the route better-auth actually serves", async () => {
    const calls: { path: string; method: string; body: unknown }[] = [];
    vi.stubGlobal("fetch", authServer(calls));
    trackLocation();

    await signInWithGoogle();

    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe("/api/auth/sign-in/social");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toMatchObject({ provider: "google" });
  });

  it("sends the browser to the link the server hands back", async () => {
    vi.stubGlobal("fetch", authServer([]));
    const location = trackLocation();

    await signInWithGoogle();

    expect(location.href).toMatch(/^https:\/\/accounts\.google\.com\//);
  });

  it("comes back to the page the button was pressed on", async () => {
    const calls: { path: string; method: string; body: unknown }[] = [];
    vi.stubGlobal("fetch", authServer(calls));
    trackLocation("https://app.test/next/?share=abc#deadbeef");

    await signInWithGoogle();

    // The hash is dropped: better-auth appends its own query string, and a
    // fragment left on the end survives the round trip into the callback.
    expect((calls[0].body as { callbackURL: string }).callbackURL).toBe("https://app.test/next/");
  });

  it("raises the failure instead of leaving a dead button", async () => {
    // The old code navigated to a 404 and showed a blank page. Whatever else
    // happens now, it must not fail silently.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 })) as unknown as typeof fetch
    );
    const location = trackLocation();

    await expect(signInWithGoogle()).rejects.toThrow(/404/);
    expect(location.href).toBe("https://app.test/next/");
  });

  it("says so when the server answers without a link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ redirect: false }), { status: 200 })) as unknown as typeof fetch
    );
    trackLocation();
    await expect(signInWithGoogle()).rejects.toThrow(/did not return a sign-in link/);
  });

  it("surfaces the server's own message when there is one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: "Provider not configured" }), { status: 400 })
      ) as unknown as typeof fetch
    );
    trackLocation();
    await expect(signInWithGoogle()).rejects.toThrow("Provider not configured");
  });
});

describe("signing out", () => {
  it("posts to the sign-out route", async () => {
    const calls: { path: string; method: string; body: unknown }[] = [];
    vi.stubGlobal("fetch", authServer(calls));
    await signOut();
    expect(calls[0]).toMatchObject({ path: "/api/auth/sign-out", method: "POST" });
  });
});
