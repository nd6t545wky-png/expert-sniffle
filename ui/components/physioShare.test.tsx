/**
 * The two halves of the physio link, from the outside.
 *
 * The share card is checked for what it must never do: send the sync key, or
 * put the decryption key anywhere but the fragment. The viewer is checked for
 * what a physio will actually hit — a good link, a link with the fragment
 * dropped by a chat app, and a revoked one.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PitchingOsApi } from "../../src/domain/api";
import { encryptJsonEnvelope } from "../../src/domain/sync";
import { buildPhysioSummary, newShareId, newShareKey } from "../../src/domain/physioShare";
import { BloodPanel } from "../../src/domain/bloods";
import { PhysioShare, SHARE_STORAGE, readStoredShare } from "./PhysioShare";
import { PhysioView } from "./PhysioView";

const SYNC_KEY = "a".repeat(64);
const TODAY = "2026-08-19";

const SUMMARY = () =>
  buildPhysioSummary({
    today: TODAY,
    athlete: "Dylan",
    throwingHand: "right",
    pre: { [TODAY]: { score: 78, planLevel: "full", inputs: { shoulder: 2, elbow: 0, forearm: 1 } } },
    bullpens: { [TODAY]: { date: TODAY, throws: 28, intent: "moderate" } },
    workload: { ratio: 1.42, inBand: false },
    restProblems: ["Three consecutive days throwing: 2026-08-10 to 2026-08-12."],
  });

const PANELS: BloodPanel[] = [
  {
    date: "2026-08-14",
    lab: "QML",
    results: { ferritin: { value: 24, low: 30, high: 300 }, ck: { value: 1420 } },
  },
  { date: "2026-02-10", results: { ferritin: { value: 58, low: 30, high: 300 } } },
];

/** The same summary, plus whatever blood work the link was asked to carry. */
const SUMMARY_WITH_BLOODS = (bloods: boolean) =>
  buildPhysioSummary({
    today: TODAY,
    athlete: "Dylan",
    throwingHand: "right",
    pre: { [TODAY]: { score: 78, planLevel: "full", inputs: { shoulder: 2, elbow: 0, forearm: 1 } } },
    bullpens: { [TODAY]: { date: TODAY, throws: 28, intent: "moderate" } },
    workload: { ratio: 1.42, inBand: false },
    restProblems: [],
    ...(bloods ? { bloods: { panels: PANELS } } : {}),
  });

interface Call {
  method: string;
  path: string;
  body: string;
  auth: string | null;
}

function apiRecording(calls: Call[], responder: (call: Call) => Response) {
  const fetcher = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    const headers = new Headers(init.headers as HeadersInit);
    const call: Call = {
      method: init.method ?? "GET",
      path: String(url),
      body: typeof init.body === "string" ? init.body : "",
      auth: headers.get("Authorization"),
    };
    calls.push(call);
    return responder(call);
  }) as unknown as typeof fetch;
  return new PitchingOsApi({ fetcher, syncKey: SYNC_KEY });
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("creating a link", () => {
  it("uploads ciphertext and never the sync key", async () => {
    const calls: Call[] = [];
    const api = apiRecording(calls, (call) =>
      call.method === "PUT"
        ? new Response(JSON.stringify({ id: "x", expiresAt: "", updatedAt: "" }), { status: 200 })
        : new Response(JSON.stringify({ shares: [] }), { status: 200 })
    );

    render(<PhysioShare api={api} hasSyncKey buildSummary={SUMMARY} origin="https://example.test" />);
    fireEvent.click(screen.getByRole("button", { name: /create link/i }));

    await waitFor(() => expect(calls.some((call) => call.method === "PUT")).toBe(true));
    const put = calls.find((call) => call.method === "PUT")!;
    const stored = readStoredShare()!;

    // The workspace credential authorises the upload, and appears nowhere in it.
    expect(put.auth).toBe(`Bearer ${SYNC_KEY}`);
    expect(put.body).not.toContain(SYNC_KEY);
    // Nor does the share's own key: the body carries the id and the ciphertext.
    expect(put.body).not.toContain(stored.key);
    expect(JSON.parse(put.body).id).toBe(stored.id);
    // And the plaintext is not in it either.
    expect(put.body).not.toContain("Dylan");
  });

  it("shows a link whose key sits after the hash", async () => {
    const api = apiRecording([], (call) =>
      call.method === "PUT"
        ? new Response(JSON.stringify({ id: "x", expiresAt: "", updatedAt: "" }), { status: 200 })
        : new Response(JSON.stringify({ shares: [] }), { status: 200 })
    );

    render(<PhysioShare api={api} hasSyncKey buildSummary={SUMMARY} origin="https://example.test" />);
    fireEvent.click(screen.getByRole("button", { name: /create link/i }));

    await waitFor(() => expect(readStoredShare()).not.toBeNull());
    const stored = readStoredShare()!;
    const shown = await screen.findByText(new RegExp(stored.id));
    expect(shown.textContent).toBe(`https://example.test/next/?share=${stored.id}#${stored.key}`);
  });

  it("reuses the stored key when updating, so an already-sent link keeps working", async () => {
    const calls: Call[] = [];
    const api = apiRecording(calls, (call) =>
      call.method === "PUT"
        ? new Response(JSON.stringify({ id: "x", expiresAt: "", updatedAt: "" }), { status: 200 })
        : new Response(JSON.stringify({ shares: [] }), { status: 200 })
    );
    const existing = { id: newShareId(), key: newShareKey(), label: "Physio" };
    window.localStorage.setItem(SHARE_STORAGE, JSON.stringify(existing));

    render(<PhysioShare api={api} hasSyncKey buildSummary={SUMMARY} origin="https://example.test" />);
    fireEvent.click(screen.getByRole("button", { name: /update now/i }));

    await waitFor(() => expect(calls.some((call) => call.method === "PUT")).toBe(true));
    // A share stored before blood results existed reads back as not carrying
    // them, which is the promise it was sent under.
    expect(readStoredShare()).toEqual({ ...existing, bloods: false });
    expect(JSON.parse(calls.find((call) => call.method === "PUT")!.body).id).toBe(existing.id);
  });

  it("asks for cloud autosave before offering a link at all", () => {
    const api = apiRecording([], () => new Response("{}", { status: 200 }));
    render(<PhysioShare api={api} hasSyncKey={false} buildSummary={SUMMARY} />);
    expect(screen.queryByRole("button", { name: /create link/i })).toBeNull();
    expect(screen.getByText(/turn on cloud autosave first/i)).toBeTruthy();
  });

  it("revokes, and forgets the key so no stale link is shown", async () => {
    const calls: Call[] = [];
    const api = apiRecording(calls, (call) =>
      call.method === "DELETE"
        ? new Response(JSON.stringify({ revoked: true }), { status: 200 })
        : new Response(JSON.stringify({ shares: [] }), { status: 200 })
    );
    const existing = { id: newShareId(), key: newShareKey(), label: "Physio" };
    window.localStorage.setItem(SHARE_STORAGE, JSON.stringify(existing));

    render(<PhysioShare api={api} hasSyncKey buildSummary={SUMMARY} origin="https://example.test" />);
    fireEvent.click(screen.getByRole("button", { name: /revoke this physio link/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm: revoke/i }));

    await waitFor(() => expect(readStoredShare()).toBeNull());
    expect(calls.some((call) => call.method === "DELETE" && call.path.includes(existing.id))).toBe(true);
    expect(screen.queryByText(new RegExp(existing.key))).toBeNull();
  });
});

/**
 * Blood results are the one thing in the summary that is not training data the
 * athlete generated, so the tests here are about consent rather than layout:
 * off unless asked for, decided per link, and never widened by a background
 * refresh of a link somebody already holds.
 */
describe("opting a link into blood results", () => {
  function apiOk(calls: Call[]) {
    return apiRecording(calls, (call) =>
      call.method === "PUT"
        ? new Response(JSON.stringify({ id: "x", expiresAt: "", updatedAt: "" }), { status: 200 })
        : new Response(JSON.stringify({ shares: [] }), { status: 200 })
    );
  }

  it("does not offer the choice when there is no blood work", () => {
    render(<PhysioShare api={apiOk([])} hasSyncKey buildSummary={SUMMARY} origin="https://example.test" />);
    expect(screen.queryByLabelText(/Include blood results/i)).toBeNull();
  });

  it("offers it unticked when there is", () => {
    render(
      <PhysioShare api={apiOk([])} hasSyncKey buildSummary={SUMMARY} hasBloods origin="https://example.test" />
    );
    const box = screen.getByRole("checkbox", { name: /Include blood results/i });
    expect((box as HTMLInputElement).checked).toBe(false);
  });

  it("creates a link that does not carry them unless the box is ticked", async () => {
    const built: boolean[] = [];
    render(
      <PhysioShare
        api={apiOk([])}
        hasSyncKey
        buildSummary={(options) => {
          built.push(options.bloods);
          return SUMMARY_WITH_BLOODS(options.bloods);
        }}
        hasBloods
        origin="https://example.test"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /create link/i }));
    await waitFor(() => expect(readStoredShare()).not.toBeNull());
    expect(built).toEqual([false]);
    expect(readStoredShare()!.bloods).toBe(false);
  });

  it("creates one that does when it is", async () => {
    const built: boolean[] = [];
    render(
      <PhysioShare
        api={apiOk([])}
        hasSyncKey
        buildSummary={(options) => {
          built.push(options.bloods);
          return SUMMARY_WITH_BLOODS(options.bloods);
        }}
        hasBloods
        origin="https://example.test"
      />
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Include blood results/i }));
    fireEvent.click(screen.getByRole("button", { name: /create link/i }));
    await waitFor(() => expect(readStoredShare()).not.toBeNull());
    expect(built).toEqual([true]);
    expect(readStoredShare()!.bloods).toBe(true);
  });

  it("republishes an existing link the moment the box changes", async () => {
    // Both directions matter: on is a deliberate disclosure, off is somebody
    // wanting results out of a link that is already sent. Neither should sit
    // waiting for the athlete to notice an Update button.
    const built: boolean[] = [];
    const existing = { id: newShareId(), key: newShareKey(), label: "Physio" };
    window.localStorage.setItem(SHARE_STORAGE, JSON.stringify(existing));
    render(
      <PhysioShare
        api={apiOk([])}
        hasSyncKey
        buildSummary={(options) => {
          built.push(options.bloods);
          return SUMMARY_WITH_BLOODS(options.bloods);
        }}
        hasBloods
        origin="https://example.test"
      />
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /Include blood results/i }));
    await waitFor(() => expect(readStoredShare()!.bloods).toBe(true));
    expect(built).toEqual([true]);
    expect(await screen.findByText(/Blood results added/)).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox", { name: /Include blood results/i }));
    await waitFor(() => expect(readStoredShare()!.bloods).toBe(false));
    expect(built).toEqual([true, false]);
    expect(await screen.findByText(/Blood results removed/)).toBeTruthy();
  });

  it("keeps the same id and key, so the link the physio holds still opens", async () => {
    const calls: Call[] = [];
    const existing = { id: newShareId(), key: newShareKey(), label: "Physio" };
    window.localStorage.setItem(SHARE_STORAGE, JSON.stringify(existing));
    render(
      <PhysioShare
        api={apiOk(calls)}
        hasSyncKey
        buildSummary={SUMMARY_WITH_BLOODS.bind(null, true)}
        hasBloods
        origin="https://example.test"
      />
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Include blood results/i }));
    await waitFor(() => expect(readStoredShare()!.bloods).toBe(true));
    expect(readStoredShare()!.id).toBe(existing.id);
    expect(readStoredShare()!.key).toBe(existing.key);
  });

  it("updating a link asks for what that link carries, not what the box defaults to", async () => {
    // The refresh path is the one that runs unattended. It must read the
    // link's own answer or a background publish would decide disclosure.
    const built: boolean[] = [];
    window.localStorage.setItem(
      SHARE_STORAGE,
      JSON.stringify({ id: newShareId(), key: newShareKey(), label: "Physio", bloods: true })
    );
    render(
      <PhysioShare
        api={apiOk([])}
        hasSyncKey
        buildSummary={(options) => {
          built.push(options.bloods);
          return SUMMARY_WITH_BLOODS(options.bloods);
        }}
        hasBloods
        origin="https://example.test"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /update now/i }));
    await waitFor(() => expect(built).toEqual([true]));
  });
});

describe("what the physio opens", () => {
  const key = newShareKey();
  const id = newShareId();

  function locate(search: string, hash: string) {
    // jsdom will not let the whole location be reassigned; the two fields the
    // viewer reads are enough and are what a real link supplies.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, search, hash, origin: "https://example.test" },
    });
  }

  beforeEach(() => locate("", ""));

  it("decrypts and renders the summary", async () => {
    const payload = await encryptJsonEnvelope(SUMMARY(), key);
    const api = apiRecording(
      [],
      () => new Response(JSON.stringify({ payload, updatedAt: "2026-08-19T09:00:00.000Z" }), { status: 200 })
    );
    locate(`?share=${id}`, `#${key}`);

    render(<PhysioView api={api} />);
    expect(await screen.findByText(/Dylan — training summary/)).toBeTruthy();
    expect(screen.getByText("1.42")).toBeTruthy();
    expect(screen.getByText(/Three consecutive days throwing/)).toBeTruthy();
    expect(screen.getByText(/shoulder 2 · elbow 0 · forearm 1/)).toBeTruthy();
    expect(screen.getByText(/28 throws · moderate intent/)).toBeTruthy();
  });

  it("never sends the key to the server", async () => {
    const calls: Call[] = [];
    const payload = await encryptJsonEnvelope(SUMMARY(), key);
    const api = apiRecording(calls, () => new Response(JSON.stringify({ payload, updatedAt: "" }), { status: 200 }));
    locate(`?share=${id}`, `#${key}`);

    render(<PhysioView api={api} />);
    await screen.findByText(/Dylan — training summary/);
    expect(calls).toHaveLength(1);
    expect(calls[0].path).not.toContain(key);
    expect(calls[0].body).toBe("");
  });

  it("shows no blood card when the link does not carry one", async () => {
    const payload = await encryptJsonEnvelope(SUMMARY_WITH_BLOODS(false), key);
    const api = apiRecording([], () => new Response(JSON.stringify({ payload, updatedAt: "" }), { status: 200 }));
    locate(`?share=${id}`, `#${key}`);
    render(<PhysioView api={api} />);
    await screen.findByText(/Dylan — training summary/);
    expect(screen.queryByText(/Blood drawn/)).toBeNull();
  });

  it("renders the panels when it does", async () => {
    const payload = await encryptJsonEnvelope(SUMMARY_WITH_BLOODS(true), key);
    const api = apiRecording([], () => new Response(JSON.stringify({ payload, updatedAt: "" }), { status: 200 }));
    locate(`?share=${id}`, `#${key}`);
    render(<PhysioView api={api} />);
    await screen.findByText(/Dylan — training summary/);

    // Locale formatting of the date is the viewer's, not this test's business.
    expect(screen.getAllByText(/^Blood drawn /)).toHaveLength(2);
    expect(screen.getByText("24 µg/L")).toBeTruthy();
    // The range travels with the row, and so does where it came from.
    expect(screen.getAllByText("30–300").length).toBeGreaterThan(0);
    expect(screen.getAllByText("own report").length).toBeGreaterThan(0);
    expect(screen.getAllByText("typical range").length).toBeGreaterThan(0);
    // The previous draw is what makes a single number mean anything.
    expect(screen.getByText(/58 µg\/L · 2026-02-10/)).toBeTruthy();
  });

  it("names what fell outside the athlete's own range, and stops there", async () => {
    const payload = await encryptJsonEnvelope(SUMMARY_WITH_BLOODS(true), key);
    const api = apiRecording([], () => new Response(JSON.stringify({ payload, updatedAt: "" }), { status: 200 }));
    locate(`?share=${id}`, `#${key}`);
    render(<PhysioView api={api} />);
    const line = await screen.findByText(/Outside the reference range/);
    expect(line.textContent).toContain("Ferritin");
    // A CK of 1420 is not raised, and no result is explained to the physio.
    expect(line.textContent).not.toContain("Creatine kinase");
    expect(line.textContent).not.toMatch(/deficien|supplement|suggests|indicat/i);
    expect(screen.getByText(/routinely\s+sit outside a population range/)).toBeTruthy();
  });

  it("says so when a chat app strips the fragment", async () => {
    const api = apiRecording([], () => new Response("{}", { status: 200 }));
    locate(`?share=${id}`, "");
    render(<PhysioView api={api} />);
    expect(await screen.findByText(/the part after the # is what unlocks it/i)).toBeTruthy();
  });

  it("says so when the link has been revoked", async () => {
    const api = apiRecording(
      [],
      () => new Response(JSON.stringify({ error: "This link is no longer active." }), { status: 404 })
    );
    locate(`?share=${id}`, `#${key}`);
    render(<PhysioView api={api} />);
    expect(await screen.findByText(/no longer active/i)).toBeTruthy();
  });

  it("says so when the key does not match the summary", async () => {
    const payload = await encryptJsonEnvelope(SUMMARY(), newShareKey());
    const api = apiRecording([], () => new Response(JSON.stringify({ payload, updatedAt: "" }), { status: 200 }));
    locate(`?share=${id}`, `#${key}`);
    render(<PhysioView api={api} />);
    expect(await screen.findByText(/could not be opened|does not open this summary/i)).toBeTruthy();
  });
});
