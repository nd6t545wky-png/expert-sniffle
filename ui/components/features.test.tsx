import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { PitchingOsApi } from "../../src/domain/api";
import { Integrations } from "./Integrations";
import { Mechanics } from "./Mechanics";
import { Nutrition } from "./Nutrition";
import { Account } from "./Account";
import { HealthForm } from "./HealthForm";

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
    // The wearable cards stay on the page and say why they are unavailable,
    // and their actions are genuinely unreachable — not merely explained.
    expect(screen.getByText(/Turn this on before connecting/)).toBeDefined();
    expect(screen.getAllByText("Cloud autosave required")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Connect Oura/ }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: /Set up Apple Health/ }).hasAttribute("disabled")).toBe(true);
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
    expect(screen.getByText(/Cloud autosave required/)).toBeDefined();
    // The capture card remains, but nothing on it can actually upload.
    expect((screen.getByLabelText("Pitching video") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Contact sheet") as HTMLInputElement).disabled).toBe(true);
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
    // Hydration is the prototype's water tracker: logged total and target are
    // separate nodes in the readout, not one "x / y" string.
    expect(screen.getByText("1.5 L")).toBeDefined();
    expect(screen.getByText(/of 4\.5 L/)).toBeDefined();
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
    // The tracker's quick-add buttons are labelled in millilitres.
    fireEvent.click(screen.getByRole("button", { name: "+500 mL" }));
    expect(onHydration).toHaveBeenCalledWith(0.5);

    // Tapping the bottle itself adds 250 mL, and reset clears the day.
    fireEvent.click(screen.getByRole("button", { name: /Add 250 millilitres/ }));
    expect(onHydration).toHaveBeenCalledWith(0.25);
    fireEvent.click(screen.getByRole("button", { name: "Reset today" }));
    expect(onHydration).toHaveBeenCalledWith("reset");
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

describe("HealthForm — connected health data reaching the check-in", () => {
  const LOCKED = { status: "locked", message: "Submit the check-in." } as const;

  /** The daily-health payload the Worker returns. */
  function daily(oura: Record<string, unknown> | null, apple: Record<string, unknown> | null = null) {
    const merged: Record<string, unknown> = {};
    for (const source of [apple, oura]) {
      for (const [key, value] of Object.entries(source ?? {})) {
        if (value !== null && value !== undefined) merged[key] = value;
      }
    }
    return {
      day: "2026-08-11",
      merged,
      sources: {
        oura: { connected: Boolean(oura), data: oura, updatedAt: "", error: "" },
        appleHealth: { connected: Boolean(apple), data: apple, updatedAt: "" },
      },
    };
  }

  function setup(options: {
    api: PitchingOsApi;
    prefill?: Record<string, unknown>;
    hasSyncKey?: boolean;
    existing?: Record<string, unknown>;
  }) {
    const prefills: [string, unknown][] = [];
    const submissions: unknown[] = [];
    const view = render(
      <HealthForm
        date="2026-08-11"
        plan={LOCKED}
        existing={options.existing ?? {}}
        onSubmitted={(_result, date, detail) => submissions.push({ date, detail })}
        api={options.api}
        prefill={options.prefill ?? {}}
        onPrefill={(date, record) => prefills.push([date, record])}
        hasSyncKey={options.hasSyncKey ?? true}
      />
    );
    return { view, prefills, submissions };
  }

  it("fetches connected health data when the check-in opens", async () => {
    // The regression this whole module exists for: the rebuilt form rendered
    // hardcoded defaults and never asked the server for anything.
    const calls = { calls: [] as string[] };
    const api = apiWith({ "/integrations/daily": daily({ sleepHours: 7.2, sleepScore: 88 }) }, calls);
    const { prefills } = setup({ api });

    await waitFor(() => expect(prefills).toHaveLength(1));
    expect(calls.calls[0]).toContain("/api/integrations/daily?day=2026-08-11");
  });

  it("does not ask the server when there is no account to ask about", () => {
    const calls = { calls: [] as string[] };
    setup({ api: apiWith({}, calls), hasSyncKey: false });
    expect(calls.calls).toHaveLength(0);
  });

  it("shows imported values in the fields and marks them read-only", () => {
    const record = daily({ sleepHours: 6.4, sleepScore: 62 });
    setup({ api: apiWith({}), prefill: { "2026-08-11": record }, hasSyncKey: false });

    const sleep = screen.getByLabelText("Sleep duration") as HTMLInputElement;
    expect(sleep.value).toBe("6.4");
    expect(sleep.readOnly).toBe(true);
    // A sleep score of 62 is an "Average" night on the 1-5 scale.
    expect((screen.getByLabelText("Sleep quality") as HTMLSelectElement).value).toBe("3");
    expect(screen.getByText(/Health data prefilled/)).toBeDefined();
    expect(screen.getByText(/auto-imported/)).toBeDefined();
  });

  it("names both devices when both supplied data", () => {
    const record = daily({ sleepHours: 7 }, { restingHeartRate: 52 });
    setup({ api: apiWith({}), prefill: { "2026-08-11": record }, hasSyncKey: false });
    expect(screen.getByText(/Oura \+ Apple Health/)).toBeDefined();
  });

  it("keeps a typed answer when a payload arrives afterwards", async () => {
    // Prefill layers *under* the athlete's input. An import landing mid-form
    // must never overwrite an answer already given.
    const api = apiWith({ "/integrations/daily": daily({ sleepHours: 9.5, sleepScore: 90 }) });
    const { view } = setup({ api });

    fireEvent.change(screen.getByLabelText("Sleep duration"), { target: { value: "5" } });
    await waitFor(() => expect((screen.getByLabelText("Sleep duration") as HTMLInputElement).value).toBe("5"));
    view.unmount();
  });

  it("surfaces a failed import instead of silently scoring without it", async () => {
    const api = apiWith({}); // every route 404s
    const { prefills } = setup({ api });
    await waitFor(() => expect(prefills).toHaveLength(1));
    expect((prefills[0][1] as { error?: string }).error).toBeTruthy();
  });

  it("says it is checking while the fetch is in flight", () => {
    setup({ api: apiWith({ "/integrations/daily": daily({ sleepHours: 8 }) }) });
    expect(screen.getByText(/Checking connected health sources/)).toBeDefined();
  });

  it("offers a retry when nothing has been imported yet", () => {
    // A submitted day is history, so no fetch fires — which leaves the
    // already-fetched empty payload on screen.
    setup({
      api: apiWith({}),
      prefill: { "2026-08-11": {} },
      existing: { "2026-08-11": { score: 80 } },
    });
    expect(screen.getByText(/No connected health values yet/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Check again" })).toBeDefined();
  });

  it("says nothing about health sources when there is no account", () => {
    setup({ api: apiWith({}), hasSyncKey: false });
    expect(screen.queryByText(/connected health/i)).toBeNull();
  });

  it("lets Oura's readiness score move the number the athlete is shown", () => {
    // The scorer weights an Oura readiness score at 25%. With the same
    // subjective answers, a poor ring reading must pull the score down.
    const score = () =>
      Number(document.querySelector(".session-status")?.textContent?.match(/(\d+)\/100/)?.[1]);

    setup({ api: apiWith({}), prefill: { "2026-08-11": daily({ readinessScore: 40 }) }, hasSyncKey: false });
    const low = score();

    cleanup();
    setup({ api: apiWith({}), prefill: { "2026-08-11": daily({ readinessScore: 95 }) }, hasSyncKey: false });
    const high = score();

    expect(low).toBeLessThan(high);
  });

  it("passes the answers and their provenance to the submission handler", () => {
    const record = daily({ sleepHours: 7.2, sleepScore: 88, hrvMs: 62, bodyweightKg: 91.5 });
    const { submissions } = setup({
      api: apiWith({}),
      prefill: { "2026-08-11": record },
      hasSyncKey: false,
    });

    fireEvent.submit(document.querySelector("#pre-form")!);

    expect(submissions).toHaveLength(1);
    const { detail } = submissions[0] as {
      detail: { inputs: Record<string, unknown>; sources: Record<string, unknown>; bodyweightKg: number };
    };
    // Without these travelling with the submission, tomorrow's rolling HRV
    // baseline has nothing to build a median from.
    expect(detail.inputs.hrvMs).toBe(62);
    expect(detail.sources.hrvSource).toBe("oura");
    expect(detail.bodyweightKg).toBe(91.5);
  });
});
