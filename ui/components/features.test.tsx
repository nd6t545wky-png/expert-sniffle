import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PitchingOsApi } from "../../src/domain/api";
import { Integrations } from "./Integrations";
import { Mechanics } from "./Mechanics";
import { Nutrition } from "./Nutrition";
import { Account } from "./Account";

const KEY = "a".repeat(64);

function apiWith(routes: Record<string, unknown>, capture?: { calls: string[] }) {
  const fetcher = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    const path = String(url);
    capture?.calls.push(`${init.method ?? "GET"} ${path}`);
    for (const [match, body] of Object.entries(routes)) {
      if (path.includes(match)) {
        return new Response(JSON.stringify(body), { status: 200 });
      }
    }
    return new Response(JSON.stringify({ error: "not stubbed" }), { status: 404 });
  }) as unknown as typeof fetch;
  return new PitchingOsApi({ fetcher, syncKey: KEY });
}

describe("Integrations", () => {
  it("requires cloud autosave before connecting anything", () => {
    render(<Integrations api={apiWith({})} hasSyncKey={false} />);
    expect(screen.getByRole("status").textContent).toContain("Turn on cloud autosave");
  });

  it("shows Oura as connected when the server says so", async () => {
    const api = apiWith({
      "/oura/status": { configured: true, connected: true, scopes: "daily", updatedAt: "2026-08-05" },
      "/apple/status": { connected: false, createdAt: "", lastUploadAt: "" },
    });
    render(<Integrations api={api} hasSyncKey />);
    await waitFor(() => expect(screen.getByText(/Connected/)).toBeDefined());
    expect(screen.getByRole("button", { name: /Disconnect Oura/ })).toBeDefined();
  });

  it("disables connecting when Oura credentials are not configured", async () => {
    const api = apiWith({
      "/oura/status": { configured: false, connected: false, scopes: "", updatedAt: "" },
      "/apple/status": { connected: false, createdAt: "", lastUploadAt: "" },
    });
    render(<Integrations api={api} hasSyncKey />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Connect Oura/ }).hasAttribute("disabled")).toBe(true)
    );
    // Shown as fineprint inside the integration card, not a standalone alert.
    expect(screen.getByText(/have not been added/)).toBeDefined();
  });

  it("shows the Apple upload token once, with a warning that it cannot be retrieved", async () => {
    const api = apiWith({
      "/oura/status": { configured: true, connected: false, scopes: "", updatedAt: "" },
      "/apple/status": { connected: false, createdAt: "", lastUploadAt: "" },
      "/apple/setup": {
        connected: true,
        uploadToken: "b".repeat(64),
        endpoint: "https://example/api/integrations/apple/ingest",
        note: "shown once",
      },
    });
    render(<Integrations api={api} hasSyncKey />);
    await waitFor(() => screen.getByRole("button", { name: /Set up Apple Health/ }));
    fireEvent.click(screen.getByRole("button", { name: /Set up Apple Health/ }));

    await waitFor(() => expect(screen.getByText("b".repeat(64))).toBeDefined());
    expect(screen.getByText(/shown once/i)).toBeDefined();
    expect(screen.getByText(/cannot be retrieved again/i)).toBeDefined();
  });
});

describe("Mechanics", () => {
  it("requires cloud autosave", () => {
    render(<Mechanics api={apiWith({})} date="2026-08-05" hasSyncKey={false} />);
    expect(screen.getByRole("status").textContent).toContain("Turn on cloud autosave");
  });

  it("lists uploaded videos", async () => {
    const api = apiWith({
      "/mechanics/videos": {
        videos: [
          {
            id: "abc123456789",
            fileName: "bullpen.mp4",
            contentType: "video/mp4",
            byteSize: 100,
            angle: "open_side",
            capturedOn: "2026-08-05",
            pitchContext: "",
            notes: "",
            createdAt: "",
            playbackUrl: "/p",
          },
        ],
      },
    });
    render(<Mechanics api={api} date="2026-08-05" hasSyncKey />);
    await waitFor(() => expect(screen.getByText("bullpen.mp4")).toBeDefined());
  });

  it("says plainly that the screen is not a lab assessment", async () => {
    const api = apiWith({ "/mechanics/videos": { videos: [] } });
    render(<Mechanics api={api} date="2026-08-05" hasSyncKey />);
    await waitFor(() => expect(screen.getByText(/not a laboratory assessment/i)).toBeDefined());
  });

  it("reports an unusable capture without inventing ratings", async () => {
    const api = apiWith({
      "/mechanics/videos": { videos: [] },
      "/mechanics/analyze": {
        analysis: {
          sourceLabel: "AI open-side movement screen",
          analyzable: false,
          captureQuality: { score: 20, decision: "fail", blockers: ["Athlete leaves frame"] },
          summary: "Capture unusable.",
          confidence: "low",
          confidenceReason: "Single view",
          sequenceRating: null,
          lowerHalfRating: null,
          trunkRating: null,
          armTimingRating: null,
          releaseRating: null,
          decelerationRating: null,
          screening: {},
          phaseReview: [],
          observations: [],
          limitations: ["Phone video only"],
          aiInterventions: [],
          model: "test",
          analyzedAt: "",
        },
      },
    });
    render(<Mechanics api={api} date="2026-08-05" hasSyncKey />);
    const input = screen.getByLabelText("Contact sheet");
    const file = new File([new Uint8Array([1])], "sheet.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText(/Capture not usable/)).toBeDefined());
    expect(screen.getByText(/Athlete leaves frame/)).toBeDefined();
    expect(screen.queryByText("/5")).toBeNull();
  });
});

describe("Nutrition", () => {
  const targets = { calories: 3000, protein: 180, carbs: 0, fat: 0, fluid: 4.5 };
  const noop = vi.fn();

  it("totals the day's meals against targets", () => {
    render(
      <Nutrition
        api={apiWith({})}
        date="2026-08-05"
        meals={[
          { id: "1", name: "Eggs", calories: 400, protein: 30, carbs: 5, fat: 25, source: "ai", createdAt: "" },
          { id: "2", name: "Rice", calories: 300, protein: 6, carbs: 65, fat: 1, source: "ai", createdAt: "" },
        ]}
        hydrationLitres={1.5}
        targets={targets}
        onAddMeal={noop}
        onRemoveMeal={noop}
        onHydration={noop}
      />
    );
    // Totals now render as metric tiles: value and target are separate nodes.
    expect(screen.getByText("700")).toBeDefined();
    expect(screen.getByText("of 3000 target")).toBeDefined();
    expect(screen.getByText("36g")).toBeDefined();
    expect(screen.getByText("of 180g target")).toBeDefined();
    expect(screen.getByText(/1\.50 L \/ 4\.5 L/)).toBeDefined();
  });

  it("adds hydration in preset increments", () => {
    const onHydration = vi.fn();
    render(
      <Nutrition
        api={apiWith({})}
        date="2026-08-05"
        meals={[]}
        hydrationLitres={0}
        targets={targets}
        onAddMeal={noop}
        onRemoveMeal={noop}
        onHydration={onHydration}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "+0.5 L" }));
    expect(onHydration).toHaveBeenCalledWith(0.5);
  });

  it("shows an AI estimate as editable and only logs it when accepted", async () => {
    const onAddMeal = vi.fn();
    const api = apiWith({
      "/nutrition/text": {
        estimate: { name: "Chicken and rice", calories: 650, protein: 45, carbs: 70, fat: 12, confidence: "low", items: [], assumptions: ["Portion assumed 150g chicken"] },
        notice: "This is an editable estimate based on the description.",
        officialMatch: false,
        sourceUrl: "",
      },
    });
    render(
      <Nutrition
        api={api}
        date="2026-08-05"
        meals={[]}
        hydrationLitres={0}
        targets={targets}
        onAddMeal={onAddMeal}
        onRemoveMeal={noop}
        onHydration={noop}
      />
    );

    fireEvent.change(screen.getByLabelText("Meal description"), { target: { value: "chicken and rice" } });
    fireEvent.click(screen.getByRole("button", { name: /Estimate from description/ }));

    await waitFor(() => expect(screen.getByText(/Chicken and rice — 650 kcal/)).toBeDefined());
    expect(screen.getByText(/editable estimate/)).toBeDefined();
    expect(screen.getByText(/Portion assumed/)).toBeDefined();
    // Nothing logged until the athlete accepts.
    expect(onAddMeal).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Add to today" }));
    expect(onAddMeal).toHaveBeenCalled();
    expect(onAddMeal.mock.calls[0][0].calories).toBe(650);
  });

  it("discards an estimate without logging it", async () => {
    const onAddMeal = vi.fn();
    const api = apiWith({
      "/nutrition/text": {
        estimate: { name: "X", calories: 1, protein: 0, carbs: 0, fat: 0, confidence: "low", items: [], assumptions: [] },
        notice: "",
      },
    });
    render(
      <Nutrition api={api} date="2026-08-05" meals={[]} hydrationLitres={0} targets={targets} onAddMeal={onAddMeal} onRemoveMeal={noop} onHydration={noop} />
    );
    fireEvent.change(screen.getByLabelText("Meal description"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: /Estimate from description/ }));
    await waitFor(() => screen.getByRole("button", { name: "Discard" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onAddMeal).not.toHaveBeenCalled();
  });

  it("adds a product found by barcode", async () => {
    const onAddMeal = vi.fn();
    const api = apiWith({
      "/nutrition/barcode": {
        found: true,
        product: {
          code: "93",
          name: "Greek Yoghurt",
          brand: "Chobani",
          servingSize: "170g",
          servingQuantity: 170,
          per100g: { calories: 60, protein: 10, carbs: 4, fat: 0 },
          perServing: { calories: 102, protein: 17, carbs: 7, fat: 0 },
          imageUrl: "",
          dataWarnings: [],
        },
      },
    });
    render(
      <Nutrition api={api} date="2026-08-05" meals={[]} hydrationLitres={0} targets={targets} onAddMeal={onAddMeal} onRemoveMeal={noop} onHydration={noop} />
    );
    fireEvent.change(screen.getByLabelText("Barcode"), { target: { value: "9300605123457" } });
    fireEvent.click(screen.getByRole("button", { name: /Look up barcode/ }));

    await waitFor(() => expect(screen.getByText("Greek Yoghurt")).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onAddMeal.mock.calls[0][0].calories).toBe(102);
    expect(onAddMeal.mock.calls[0][0].name).toBe("Chobani Greek Yoghurt");
  });
});

describe("Account", () => {
  it("explains that the recovery key is what decrypts cloud data", async () => {
    const api = apiWith({ "/account/status": { signedIn: false, workspaceReady: false } });
    render(<Account api={api} syncKey="" onSyncKey={vi.fn()} onSyncNow={vi.fn()} syncStatus="" />);
    await waitFor(() => expect(screen.getByText(/never sees it/)).toBeDefined());
  });

  it("masks the key until revealed", async () => {
    const api = apiWith({ "/account/status": { signedIn: true, workspaceReady: true, syncKey: KEY } });
    render(<Account api={api} syncKey={KEY} onSyncKey={vi.fn()} onSyncNow={vi.fn()} syncStatus="" />);
    await waitFor(() => screen.getByRole("button", { name: "Show" }));
    expect(screen.queryByText(KEY)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByText(KEY)).toBeDefined();
  });

  it("rejects a malformed recovery key", async () => {
    const onSyncKey = vi.fn();
    const api = apiWith({ "/account/status": { signedIn: false, workspaceReady: false } });
    render(<Account api={api} syncKey="" onSyncKey={onSyncKey} onSyncNow={vi.fn()} syncStatus="" />);
    await waitFor(() => screen.getByPlaceholderText(/64-character/));
    fireEvent.change(screen.getByPlaceholderText(/64-character/), { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: "Use this key" }));
    expect(onSyncKey).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("64 hexadecimal");
  });

  it("accepts a valid key", async () => {
    const onSyncKey = vi.fn();
    const api = apiWith({ "/account/status": { signedIn: false, workspaceReady: false } });
    render(<Account api={api} syncKey="" onSyncKey={onSyncKey} onSyncNow={vi.fn()} syncStatus="" />);
    await waitFor(() => screen.getByPlaceholderText(/64-character/));
    fireEvent.change(screen.getByPlaceholderText(/64-character/), { target: { value: KEY.toUpperCase() } });
    fireEvent.click(screen.getByRole("button", { name: "Use this key" }));
    expect(onSyncKey).toHaveBeenCalledWith(KEY);
  });

  it("cannot sync without a key", async () => {
    const api = apiWith({ "/account/status": { signedIn: false, workspaceReady: false } });
    render(<Account api={api} syncKey="" onSyncKey={vi.fn()} onSyncNow={vi.fn()} syncStatus="" />);
    await waitFor(() => screen.getByRole("button", { name: "Sync now" }));
    expect(screen.getByRole("button", { name: "Sync now" }).hasAttribute("disabled")).toBe(true);
  });
});
