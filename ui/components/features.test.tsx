import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { PitchingOsApi } from "../../src/domain/api";
import { Integrations } from "./Integrations";
import { Mechanics } from "./Mechanics";
import { Nutrition } from "./Nutrition";
import { Account } from "./Account";
import { HealthForm } from "./HealthForm";
import { Tracking } from "./Tracking";
import { ProgressSpec, ProgressTrends } from "./ProgressTrends";
import { MovementPlot } from "./MovementPlot";
import { Micronutrients } from "./Micronutrients";
import { KinematicsCapture } from "./KinematicsCapture";
import { DataBackup } from "./DataBackup";
import { ConfirmButton, DISARM_MS } from "./ConfirmButton";
import { PitchData } from "./PitchData";
import { WaterTracker } from "./WaterTracker";
import { GameLog } from "./GameLog";
import { Game } from "../../src/domain/gameLog";
import { Pitch } from "../../src/domain/pitchLog";
import { Dashboard } from "./Dashboard";
import { SessionRecap } from "./SessionRecap";
import { SessionRecap as Recap } from "../../src/domain/sessionRecap";
import { SessionReport } from "../../src/domain/session";

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
    // Reset is destructive, so it arms first and only acts on the second tap.
    fireEvent.click(screen.getByRole("button", { name: /^Reset today today's hydration$/ }));
    fireEvent.click(screen.getByRole("button", { name: /Confirm: reset today/ }));
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
    expect((screen.getByLabelText("Sleep quality") as unknown as HTMLSelectElement).value).toBe("3");
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

describe("Recovery trends — readable without prior knowledge", () => {
  function withOura(date: string, oura: Record<string, unknown>) {
    return { [date]: { day: date, merged: {}, sources: { oura: { connected: true, data: oura } } } };
  }

  /** `count` days of the given metric, so a usual range can be established. */
  function run(field: string, values: number[]) {
    let prefill = {};
    values.forEach((value, index) => {
      const date = `2026-08-${String(index + 1).padStart(2, "0")}`;
      prefill = { ...prefill, ...withOura(date, { [field]: value }) };
    });
    return prefill;
  }

  const trackingProps = {
    date: "2026-08-11" as const,
    plan: { status: "locked", message: "" } as const,
    reports: {},
    onReport: () => {},
  };

  function show(prefill: Record<string, unknown>) {
    render(<Tracking {...trackingProps} healthPrefill={prefill} submissions={{}} />);
  }

  it("titles every series in plain English, not sensor jargon", () => {
    show({});
    for (const title of [
      "Recovery score",
      "Sleep quality",
      "Overnight recovery",
      "Time under stress",
      "Daily activity",
      "Blood oxygen",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeDefined();
    }
    // The old titles named the sensor rather than the thing measured.
    expect(screen.queryByRole("heading", { name: "HRV" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Oura readiness" })).toBeNull();
  });

  it("says which direction is good, because that is not guessable", () => {
    show({});
    // Every other chart's "up" is this one's bad news.
    expect(screen.getByText(/Minutes during the day.*Lower is better\./)).toBeDefined();
    expect(screen.getByText(/how recovered your body is.*Higher is better\./)).toBeDefined();
  });

  it("leads with the latest value, large, rather than only a shape", () => {
    show(run("readinessScore", [70, 72, 68, 71, 69, 83]));
    // The hero number on the card, not the axis label or the table row.
    expect(document.querySelector(".trend-value strong")?.textContent).toContain("83");
  });

  it("judges today against the athlete's own usual range", () => {
    // Six days at ~70, then an 83 — better than this athlete's normal.
    show(run("readinessScore", [70, 72, 68, 71, 69, 83]));
    expect(screen.getByText("Better than usual")).toBeDefined();
    expect(screen.getByText(/you usually sit/)).toBeDefined();
  });

  it("calls a low day worse on a higher-is-better metric", () => {
    show(run("readinessScore", [70, 72, 68, 71, 69, 41]));
    expect(screen.getByText("Worse than usual")).toBeDefined();
  });

  it("inverts the verdict where lower is better", () => {
    // A spike in stress minutes is bad news, not good news.
    show(run("stressHighMinutes", [30, 25, 35, 28, 32, 240]));
    expect(screen.getByText("Worse than usual")).toBeDefined();
  });

  it("will not call a day unusual before a normal is established", () => {
    show(run("readinessScore", [70, 95]));
    expect(screen.getByText("Building your normal")).toBeDefined();
    expect(screen.queryByText("Better than usual")).toBeNull();
  });

  it("never states a verdict by colour alone", () => {
    // A red/amber/green trio is indistinguishable under protanopia, so the
    // sentence has to survive the tint being ignored entirely.
    show(run("readinessScore", [70, 72, 68, 71, 69, 83]));
    const pill = screen.getByText("Better than usual");
    expect(pill.textContent).toContain("Better than usual");
    expect(pill.className).toContain("is-better");
  });

  it("labels the y-axis, so a reader can tell whether 62 is high", () => {
    show(run("hrvMs", [55, 60, 58, 62, 59, 61]));
    const chart = document.querySelector(".trend-chart svg")!;
    expect(chart.querySelectorAll(".trend-tick").length).toBeGreaterThanOrEqual(2);
    expect(chart.querySelectorAll(".trend-gridline").length).toBeGreaterThanOrEqual(2);
  });

  it("draws the usual range as a band behind the line", () => {
    show(run("readinessScore", [70, 72, 68, 71, 69, 83]));
    expect(document.querySelector(".trend-band")).not.toBeNull();
  });

  it("marks and labels only the latest point, never every point", () => {
    show(run("readinessScore", [70, 72, 68, 71, 69, 83]));
    const chart = document.querySelector(".trend-chart svg")!;
    // A dot and a number on all six points is noise; the table carries them.
    expect(chart.querySelectorAll(".trend-dot")).toHaveLength(1);
    expect(chart.querySelectorAll(".trend-endlabel")).toHaveLength(1);
    // But every point still has a generous hover target.
    expect(chart.querySelectorAll(".trend-hit")).toHaveLength(6);
  });

  it("colours the latest marker by what it means, not by series identity", () => {
    show(run("readinessScore", [70, 72, 68, 71, 69, 83]));
    expect(document.querySelector(".trend-dot")!.getAttribute("class")).toContain("is-better");
  });

  it("offers every value as a table, not only on hover", () => {
    show(run("readinessScore", [70, 72, 68, 71, 69, 83]));
    expect(screen.getAllByText("See the numbers").length).toBeGreaterThan(0);
    // Newest first, so the row that matters is the one you land on.
    const rows = document.querySelectorAll(".trend-table tbody tr");
    expect(rows).toHaveLength(6);
    expect(rows[0].textContent).toContain("83");
  });

  it("shows the empty state for a metric the ring never returned", () => {
    show(withOura("2026-08-01", { readinessScore: 70 }));
    expect(screen.getByText(/No blood oxygen yet/i)).toBeDefined();
  });

  it("says plainly that blank days are not filled in", () => {
    show({});
    expect(screen.getByText(/nothing here is estimated or filled in/)).toBeDefined();
  });

  it("plots a zero-stress day rather than dropping it", () => {
    show(run("stressHighMinutes", [0, 140]));
    const chart = screen.getByRole("img", { name: /Time under stress over/ });
    expect(chart.querySelectorAll(".trend-hit")).toHaveLength(2);
  });

  it("does not crash when nothing has ever been imported", () => {
    expect(() => render(<Tracking {...trackingProps} />)).not.toThrow();
  });
});


describe("Dashboard readiness provenance", () => {
  const base = {
    date: "2026-08-11" as const,
    plan: { status: "locked", message: "Check in first." } as const,
    eyebrow: "Week 4",
    heading: "Tuesday 11 August",
    focus: "Build",
    teamName: "Norths",
    teamLogo: "",
    teamLogoAlt: "",
    sessionTitle: "Session",
    sessionDescription: "",
    sessionDuration: "60 min",
    sessionStress: "Moderate",
    taskCount: 0,
    completedCount: 0,
    weekLoad: 0,
    hydrationLitres: 0,
    fluidTarget: 0,
    onNavigate: () => {},
    onOpenPlan: () => {},
  };

  it("credits Oura when the ring supplied the day's data", () => {
    render(
      <Dashboard
        {...base}
        health={{ sources: { oura: { connected: true, data: { hrvMs: 60 } as never } } }}
      />
    );
    const tag = screen.getByText("Oura + check-in");
    expect(tag.className).toContain("sensor");
  });

  it("does not claim a device for a manual check-in", () => {
    render(<Dashboard {...base} />);
    const tag = screen.getByText("Health check-in");
    expect(tag.className).toContain("manual");
  });
});

describe("Check-out velocity capture", () => {
  it("stores a measured velocity, and omits it when nothing was measured", () => {
    const saved: Record<string, unknown>[] = [];
    const props = {
      date: "2026-08-11" as const,
      plan: { status: "unlocked", planLevel: "full", workloadFactor: 1 } as const,
      reports: {},
      onReport: (report: SessionReport) => saved.push(report as unknown as Record<string, unknown>),
    };

    const { unmount } = render(<Tracking {...props} />);
    fireEvent.submit(document.querySelector("#post-form")!);
    // A blank field means "not measured" — storing 0 would put 0 mph on the
    // recap card and read as a recorded attempt.
    expect(saved[0].bestVelocity).toBeUndefined();
    unmount();

    render(<Tracking {...props} />);
    fireEvent.change(screen.getByLabelText("Best velocity"), { target: { value: "92" } });
    fireEvent.submit(document.querySelector("#post-form")!);
    expect(saved[1].bestVelocity).toBe(92);
    expect(saved[1].velocityType).toBe("pulldown");
  });
});

describe("SessionRecap — the Strava-style share card", () => {
  const stats = [
    { id: "throws", label: "Throws", value: "42" },
    { id: "tonnage", label: "Volume lifted", value: "3,870 kg" },
  ];
  const recap: Recap = {
    date: "2026-08-11" as const,
    title: "Bullpen",
    focus: "Command",
    effort: "75% effort",
    available: [...stats, { id: "rpe", label: "Session RPE", value: "7" }],
    stats,
    highlights: ["Back squat · 3 × 5 @ 130 kg"],
    pb: null,
    hasContent: true,
  };

  function setup(
    options: { api?: PitchingOsApi; hasSyncKey?: boolean; caption?: string; recap?: Recap } = {}
  ) {
    const captions: string[] = [];
    const toggled: string[] = [];
    render(
      <SessionRecap
        date="2026-08-11"
        recap={options.recap ?? recap}
        api={options.api ?? apiWith({})}
        hasSyncKey={options.hasSyncKey ?? true}
        caption={options.caption ?? ""}
        onCaption={(value) => captions.push(value)}
        chosen={["throws", "tonnage"]}
        onToggleStat={(id) => toggled.push(id)}
      />
    );
    return { captions, toggled };
  }

  it("shows the day's work on the card", () => {
    setup();
    expect(screen.getByText("Bullpen")).toBeDefined();
    expect(screen.getByText(/75% effort/)).toBeDefined();
    // "42" also appears in the picker's preview of the same stat.
    expect(document.querySelector(".recap-stats")!.textContent).toContain("42");
    expect(document.querySelector(".recap-stats")!.textContent).toContain("3,870 kg");
    expect(screen.getByText("Back squat · 3 × 5 @ 130 kg")).toBeDefined();
  });

  it("asks for a photo for this day, not for a shared pool", async () => {
    const calls = { calls: [] as string[] };
    setup({ api: apiWith({}, calls) });
    await waitFor(() => expect(calls.calls.join()).toContain("/api/session-photos/2026-08-11"));
  });

  it("does not reach for a photo without an account to store it against", () => {
    const calls = { calls: [] as string[] };
    setup({ api: apiWith({}, calls), hasSyncKey: false });
    expect(calls.calls).toHaveLength(0);
    expect(screen.getByText(/Cloud autosave required/)).toBeDefined();
  });

  it("says plainly that saving publishes nothing", () => {
    // The card leaves the app as a file. Where it goes next must be the
    // athlete's decision, and the UI has to say so.
    setup();
    expect(screen.getByText(/Nothing is posted automatically/)).toBeDefined();
  });

  it("still offers the card when there is no photo", () => {
    setup();
    expect(screen.getByRole("button", { name: "Add photo" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Share" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Save image" })).toBeDefined();
    // Remove is meaningless with nothing attached.
    expect(screen.queryByRole("button", { name: "Remove photo" })).toBeNull();
  });

  it("carries the caption back to the caller so it syncs", () => {
    const { captions } = setup();
    fireEvent.change(screen.getByLabelText("Caption"), { target: { value: "First bullpen back" } });
    expect(captions).toContain("First bullpen back");
  });

  it("shows the caption on the card itself", () => {
    setup({ caption: "Felt sharp" });
    expect(screen.getByText("Felt sharp")).toBeDefined();
  });

  it("lets the athlete choose which numbers appear", () => {
    const { toggled } = setup();
    fireEvent.click(screen.getByText("Session RPE"));
    expect(toggled).toEqual(["rpe"]);
  });

  it("shows a personal best when one was set", () => {
    setup({
      recap: {
        ...recap,
        pb: { label: "Pulldown velocity", value: "92 mph", previous: "89 mph" },
      },
    });
    expect(screen.getByText(/New PB · Pulldown velocity 92 mph/)).toBeDefined();
  });

  it("says nothing about a PB when none was set", () => {
    setup();
    expect(screen.queryByText(/New PB/)).toBeNull();
  });

  it("explains itself instead of rendering an empty card on an unlogged day", () => {
    setup({ recap: { ...recap, available: [], stats: [], highlights: [], hasContent: false } });
    expect(screen.getByText(/Nothing is logged/)).toBeDefined();
    expect(screen.queryByRole("button", { name: "Save image" })).toBeNull();
  });
});

describe("Training trends — is the work moving the numbers", () => {
  const points = (values: [string, number][]) =>
    values.map(([date, value]) => ({ date, value }));

  const lift = {
    key: "lift-Trap bar deadlift",
    title: "Trap bar deadlift",
    explain: "Estimated one-rep max from your heaviest set that day.",
    higherIsBetter: true,
    unit: " kg",
    precision: 1,
  };

  function show(specs: ProgressSpec[]) {
    render(<ProgressTrends specs={specs} />);
  }

  it("leads with the latest value and how far it has come", () => {
    show([
      {
        ...lift,
        points: points([
          ["2026-07-13", 145],
          ["2026-07-20", 151.7],
          ["2026-08-03", 159.5],
        ]),
      },
    ]);
    expect(document.querySelector(".trend-value strong")?.textContent).toContain("159.5");
    expect(screen.getByText(/\+14\.5 kg since 13 July/)).toBeDefined();
    expect(screen.getByText(/3 sessions/)).toBeDefined();
  });

  it("compares against where the athlete started, not against a usual range", () => {
    show([
      {
        ...lift,
        points: points([
          ["2026-07-13", 145],
          ["2026-08-03", 159.5],
        ]),
      },
    ]);
    // The Oura framing would read "better than usual" forever on a rising line.
    expect(screen.queryByText(/than usual/)).toBeNull();
    expect(screen.getByText("Best on record")).toBeDefined();
    // No usual range means no band, so its key must not appear either.
    expect(screen.queryByText(/shaded band/)).toBeNull();
  });

  it("names the high-water mark when the latest session is off it", () => {
    show([
      {
        ...lift,
        points: points([
          ["2026-07-13", 145],
          ["2026-07-20", 160],
          ["2026-08-03", 152],
        ]),
      },
    ]);
    expect(screen.getByText("best")).toBeDefined();
    expect(screen.getByText(/Best on record: 160\.0 kg on 20 July/)).toBeDefined();
    expect(screen.getByText("Up on where you started")).toBeDefined();
  });

  it("never calls a bodyweight a best — neither direction is good news", () => {
    show([
      {
        key: "bodyweight",
        title: "Bodyweight",
        explain: "What you weighed at check-in.",
        higherIsBetter: null,
        unit: " kg",
        precision: 1,
        points: points([
          ["2026-07-13", 89.4],
          ["2026-08-10", 88.2],
        ]),
      },
    ]);
    expect(screen.getByText("Down on where you started")).toBeDefined();
    expect(screen.queryByText("Best on record")).toBeNull();
    expect(screen.queryByText("best")).toBeNull();
  });

  it("says the strength figures are estimates, not maxes that were lifted", () => {
    show([{ ...lift, points: points([["2026-07-13", 145], ["2026-08-03", 159.5]]) }]);
    // The caveat spans an <em>, so it is read off the paragraph's text.
    const intro = document.querySelector(".disclosure-intro")?.textContent ?? "";
    expect(intro).toMatch(/estimated one-rep maxes.*not maxes you lifted/);
  });

  it("keeps every value reachable without hovering or seeing colour", () => {
    show([
      {
        ...lift,
        points: points([
          ["2026-07-13", 145],
          ["2026-08-03", 159.5],
        ]),
      },
    ]);
    const rows = [...document.querySelectorAll(".trend-table tbody tr")];
    expect(rows.length).toBe(2);
    // Newest first, as the recovery tables read.
    expect(rows[0].textContent).toContain("159.5");
  });

  it("renders nothing at all when there is no history to plot", () => {
    const { container } = render(<ProgressTrends specs={[]} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("Movement plot — where each pitch finishes", () => {
  let n = 0;
  const throwPitch = (over: Partial<Pitch>): Pitch => ({
    id: `mp${(n += 1)}`,
    date: "2026-08-12",
    pitchType: "Fastball",
    velocityMph: 88,
    spinRpm: 2200,
    spinEfficiencyPct: null,
    inducedVertBreakIn: 16,
    horzBreakIn: 11,
    releaseHeightFt: null,
    releaseSideFt: null,
    extensionFt: null,
    source: "rapsodo",
    ...over,
  });

  const many = (count: number, over: Partial<Pitch>) =>
    Array.from({ length: count }, () => throwPitch(over));

  it("names each pitch type on the plot rather than in a colour key", () => {
    render(
      <MovementPlot
        pitches={[
          ...many(4, {}),
          ...many(4, { pitchType: "Curveball", horzBreakIn: -9, inducedVertBreakIn: -11, velocityMph: 74 }),
        ]}
        priorPitches={[]}
      />
    );
    // Identity is text on the chart — it never depends on matching a hue.
    // Read off the plot itself; the table below carries the same names.
    const onPlot = [...document.querySelectorAll(".movement-label")].map((n) => n.textContent);
    expect(onPlot).toContain("Fastball");
    expect(onPlot).toContain("Curveball");
  });

  it("labels the four directions in words", () => {
    render(<MovementPlot pitches={many(3, {})} priorPitches={[]} />);
    for (const word of ["ride ↑", "drop ↓", "arm side →", "← glove side", "no break"]) {
      expect(screen.getByText(word)).toBeDefined();
    }
  });

  it("says how many readings carried no break instead of dropping them quietly", () => {
    render(
      <MovementPlot
        pitches={[
          ...many(3, {}),
          throwPitch({ horzBreakIn: null, inducedVertBreakIn: null, source: "pocketRadar" }),
        ]}
        priorPitches={[]}
      />
    );
    expect(screen.getByText(/1 reading carried speed but no break/)).toBeDefined();
  });

  it("explains itself when every reading is speed-only", () => {
    render(
      <MovementPlot
        pitches={many(3, { horzBreakIn: null, inducedVertBreakIn: null, source: "pocketRadar" })}
        priorPitches={[]}
      />
    );
    expect(screen.getByText("No break data yet")).toBeDefined();
    expect(screen.getByText(/a radar gun cannot measure it/)).toBeDefined();
  });

  it("flags two pitches finishing in the same place at the same speed", () => {
    render(
      <MovementPlot
        pitches={[
          ...many(3, { pitchType: "Slider", horzBreakIn: -6, inducedVertBreakIn: 2, velocityMph: 79 }),
          ...many(3, { pitchType: "Cutter", horzBreakIn: -3, inducedVertBreakIn: 4, velocityMph: 81 }),
        ]}
        priorPitches={[]}
      />
    );
    expect(screen.getByText(/finish in much the same place/)).toBeDefined();
  });

  it("offers no history toggle when there is no history", () => {
    render(<MovementPlot pitches={many(3, {})} priorPitches={[]} />);
    expect(screen.queryByRole("button", { name: /every session/i })).toBeNull();
  });

  it("switches between this session and every session", () => {
    render(
      <MovementPlot
        pitches={many(3, {})}
        priorPitches={many(3, { date: "2026-08-05", pitchType: "Splitter", horzBreakIn: 6, inducedVertBreakIn: 2 })}
      />
    );
    const onPlot = () => [...document.querySelectorAll(".movement-label")].map((n) => n.textContent);
    // The earlier session's pitch is absent until the toggle is pressed.
    expect(onPlot()).not.toContain("Splitter");
    fireEvent.click(screen.getByRole("button", { name: /every session/i }));
    expect(onPlot()).toContain("Splitter");
  });

  it("compares today against the earlier sessions, not against itself", () => {
    render(
      <MovementPlot
        pitches={many(3, { horzBreakIn: 14, inducedVertBreakIn: 18 })}
        priorPitches={many(3, { date: "2026-08-05", horzBreakIn: 11, inducedVertBreakIn: 16 })}
      />
    );
    fireEvent.click(screen.getByText("Today against your earlier sessions"));
    const cells = [...document.querySelectorAll("table")]
      .flatMap((table) => [...table.querySelectorAll("td")])
      .map((cell) => cell.textContent);
    expect(cells).toContain("+3.0″");
    expect(cells).toContain("+2.0″");
  });
});

describe("Micronutrients — the difference between zero and 'the label did not say'", () => {
  it("marks a total as a floor when some foods stayed silent", () => {
    render(<Micronutrients foods={[{ iron: 4 }, {}]} />);
    expect(screen.getByText("at least")).toBeDefined();
    expect(screen.getByText(/1 of 2 foods declared it/)).toBeDefined();
  });

  it("states a total plainly when every food declared it", () => {
    render(<Micronutrients foods={[{ iron: 4 }, { iron: 5 }]} />);
    expect(screen.queryByText("at least")).toBeNull();
    expect(screen.getAllByText(/Every food today declared it/).length).toBeGreaterThan(0);
  });

  it("draws no bar for a nutrient nothing declared", () => {
    // An empty track reads as "none of it", which is the one thing this card
    // exists to avoid saying.
    render(<Micronutrients foods={[{ iron: 4 }]} />);
    const unknown = document.querySelectorAll(".micro-row.is-unknown");
    expect(unknown.length).toBeGreaterThan(0);
    for (const row of unknown) expect(row.querySelector(".micro-bar")).toBeNull();
    // The declared one still gets its bar.
    expect(document.querySelector(".micro-row:not(.is-unknown) .micro-bar")).not.toBeNull();
  });

  it("never calls a partial total a shortfall", () => {
    render(<Micronutrients foods={[{ iron: 0.2 }, {}, {}]} />);
    expect(screen.queryByText(/% of the/)).toBeNull();
  });

  it("calls a shortfall when the figure is complete", () => {
    render(<Micronutrients foods={[{ calcium: 100 }, { calcium: 100 }]} />);
    expect(screen.getByText(/Calcium is 20% of the 1000mg target/)).toBeDefined();
  });

  it("scales the saturated-fat guidance with the day's calorie target", () => {
    render(<Micronutrients foods={[{ saturatedFat: 10 }]} calorieTarget={3600} />);
    // 3600 kcal × 10% ÷ 9 = 40 g.
    expect(screen.getByText(/40g limit/)).toBeDefined();
  });

  it("says so when nothing carried label detail at all", () => {
    render(<Micronutrients foods={[{}, {}]} />);
    expect(screen.getByText(/None of today’s 2 foods carried label detail/)).toBeDefined();
  });
});

describe("Kinematics capture — measured angles from the athlete's own video", () => {
  const noop = () => {};

  it("offers only the measurements the chosen camera view can see", () => {
    render(<KinematicsCapture date="2026-08-12" captures={[]} onSave={noop} onRemove={noop} />);
    // Nothing measurable until a video is open.
    expect(screen.getByText("No video open")).toBeDefined();
  });

  it("lists saved measurements and lets one be removed", () => {
    const removed: string[] = [];
    render(
      <KinematicsCapture
        date="2026-08-12"
        captures={[
          { id: "k1", date: "2026-08-05", view: "side", aspect: 16 / 9, times: {}, frames: {} },
        ]}
        onSave={noop}
        onRemove={(id) => removed.push(id)}
      />
    );
    expect(screen.getByText("Saved measurements (1)")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /^Remove the measurement from 2026-08-05$/ }));
    // Guarded: the first tap only arms it.
    expect(removed).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /Confirm: remove the measurement/ }));
    expect(removed).toEqual(["k1"]);
  });

  it("says plainly that the video is never uploaded", () => {
    render(<KinematicsCapture date="2026-08-12" captures={[]} onSave={noop} onRemove={noop} />);
    expect(screen.getByText(/video itself is never uploaded/)).toBeDefined();
  });

  it("leads with what a single camera cannot do", () => {
    render(<KinematicsCapture date="2026-08-12" captures={[]} onSave={noop} onRemove={noop} />);
    expect(screen.getByText("What this is, and is not")).toBeDefined();
    expect(screen.getByText(/these angles are projections/)).toBeDefined();
  });
});

describe("Data backup — the only way data leaves this app", () => {
  const state = { version: 1, pre: { "2026-08-10": { score: 78 } } } as never;

  it("warns that the recovery key is the only way back in", () => {
    render(<DataBackup state={state} onReplace={() => {}} />);
    expect(screen.getByText("Your recovery key is the only way back in")).toBeDefined();
    expect(screen.getByText(/a backup file is the only thing that survives both/)).toBeDefined();
  });

  it("says how much is in the file, in the singular when it should be", () => {
    render(<DataBackup state={state} onReplace={() => {}} />);
    expect(screen.getByText(/^1 record, schema version 1\./)).toBeDefined();
  });

  it("cannot export when there is nothing loaded", () => {
    render(<DataBackup state={null} onReplace={() => {}} />);
    expect(screen.getByRole("button", { name: "Download a backup" })).toHaveProperty("disabled", true);
  });

  it("writes nothing until the replacement is confirmed", async () => {
    const replaced: unknown[] = [];
    render(<DataBackup state={state} onReplace={(next) => replaced.push(next)} />);

    const file = new File(
      [JSON.stringify({ version: 1, pre: { "2026-01-01": { score: 60 } } })],
      "backup.json",
      { type: "application/json" }
    );
    fireEvent.change(document.querySelector('input[aria-label="Backup file"]')!, {
      target: { files: [file] },
    });

    await waitFor(() => expect(screen.getByText("Replace everything on this device?")).toBeDefined());
    // Choosing the file must not have written anything yet.
    expect(replaced).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Replace everything" }));
    expect(replaced).toHaveLength(1);
  });

  it("lets the replacement be cancelled", async () => {
    const replaced: unknown[] = [];
    render(<DataBackup state={state} onReplace={(next) => replaced.push(next)} />);
    const file = new File([JSON.stringify({ version: 1 })], "backup.json", {
      type: "application/json",
    });
    fireEvent.change(document.querySelector('input[aria-label="Backup file"]')!, {
      target: { files: [file] },
    });
    await waitFor(() => expect(screen.getByText("Replace everything on this device?")).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByText("Replace everything on this device?")).toBeNull()
    );
    expect(replaced).toHaveLength(0);
  });

  it("refuses a bad file with reasons rather than half-applying it", async () => {
    const replaced: unknown[] = [];
    render(<DataBackup state={state} onReplace={(next) => replaced.push(next)} />);
    const file = new File(["{ not json"], "broken.json", { type: "application/json" });
    fireEvent.change(document.querySelector('input[aria-label="Backup file"]')!, {
      target: { files: [file] },
    });
    await waitFor(() => expect(screen.getByText(/broken.json was not imported/)).toBeDefined());
    expect(screen.getByText(/not valid JSON/)).toBeDefined();
    expect(replaced).toHaveLength(0);
  });
});

describe("ConfirmButton — destructive actions ask once", () => {
  it("does nothing on the first tap", () => {
    const fired: number[] = [];
    render(<ConfirmButton label="Remove" describe="the slider" onConfirm={() => fired.push(1)} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove the slider" }));
    expect(fired).toHaveLength(0);
    expect(screen.getByText("Remove?")).toBeDefined();
  });

  it("acts on the second tap", () => {
    const fired: number[] = [];
    render(<ConfirmButton label="Remove" describe="the slider" onConfirm={() => fired.push(1)} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove the slider" }));
    fireEvent.click(screen.getByRole("button", { name: /Confirm: remove the slider/ }));
    expect(fired).toHaveLength(1);
  });

  it("can be cancelled", () => {
    const fired: number[] = [];
    render(<ConfirmButton label="Remove" describe="the slider" onConfirm={() => fired.push(1)} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove the slider" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep the slider" }));
    expect(fired).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Remove the slider" })).toBeDefined();
  });

  it("says out loud that the second tap cannot be undone", () => {
    render(<ConfirmButton label="Remove" describe="the slider" onConfirm={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove the slider" }));
    // The guard has to exist for a screen reader, not only as a visual pause.
    expect(screen.getByRole("button", { name: /This cannot be undone/ })).toBeDefined();
  });

  it("disarms itself rather than staying a trap for the next tap", async () => {
    vi.useFakeTimers();
    try {
      const fired: number[] = [];
      render(<ConfirmButton label="Remove" describe="the slider" onConfirm={() => fired.push(1)} />);
      fireEvent.click(screen.getByRole("button", { name: "Remove the slider" }));
      expect(screen.getByText("Remove?")).toBeDefined();
      act(() => {
        vi.advanceTimersByTime(DISARM_MS + 50);
      });
      expect(screen.queryByText("Remove?")).toBeNull();
      expect(fired).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("destructive actions across the app are guarded", () => {
  it("does not remove a pitch on the first tap", () => {
    const removed: string[] = [];
    render(
      <PitchData
        date="2026-08-12"
        pitches={[
          {
            id: "p1",
            date: "2026-08-12",
            pitchType: "Slider",
            velocityMph: 79,
            spinRpm: null,
            spinEfficiencyPct: null,
            inducedVertBreakIn: null,
            horzBreakIn: null,
            releaseHeightFt: null,
            releaseSideFt: null,
            extensionFt: null,
            source: "manual",
          },
        ]}
        onImport={() => {}}
        onAdd={() => {}}
        onRemove={(id) => removed.push(id)}
      />
    );
    fireEvent.click(screen.getByText("Every pitch (1)"));
    fireEvent.click(screen.getByRole("button", { name: /^Remove Slider at 79 mph$/ }));
    expect(removed).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /Confirm: remove Slider at 79 mph/ }));
    expect(removed).toEqual(["p1"]);
  });

  it("does not wipe the day's hydration on the first tap", () => {
    const changes: (number | "reset")[] = [];
    render(<WaterTracker date="2026-08-12" logged={2} goal={3.6} onChange={(v) => changes.push(v)} />);
    fireEvent.click(screen.getByRole("button", { name: /^Reset today today's hydration$/ }));
    expect(changes).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /Confirm: reset today/ }));
    expect(changes).toEqual(["reset"]);
  });
});

describe("Game log — the outings the training exists to serve", () => {
  const game = (over: Partial<Game> = {}): Game => ({
    id: "g1",
    date: "2026-08-07",
    opponent: "Coomera Cubs",
    side: "home",
    outs: 15,
    battersFaced: 20,
    pitches: 78,
    strikes: 50,
    firstPitchStrikes: 13,
    hits: 4,
    runs: 2,
    earnedRuns: 2,
    walks: 2,
    strikeouts: 6,
    hitBatters: 0,
    ...over,
  });

  const show = (
    games: Game[],
    onSave: (game: Game) => void = () => {},
    onRemove: (id: string) => void = () => {}
  ) => render(<GameLog date="2026-08-12" games={games} onSave={onSave} onRemove={onRemove} />);

  it("writes innings the way a scorebook does", () => {
    show([game({ outs: 11 })]);
    expect(screen.getByText("3.2")).toBeDefined();
  });

  it("adds innings as outs, so a season cannot show an impossible count", () => {
    // Two outings of 3.2 are 7.1 innings. A decimal store would print 6.4.
    show([game({ id: "a", outs: 11 }), game({ id: "b", date: "2026-08-01", outs: 11 })]);
    // Both the card head and the thin-sample note say it; one is enough.
    expect(screen.getAllByText(/7\.1 innings/).length).toBeGreaterThan(0);
  });

  it("refuses a line with more strikes than pitches", () => {
    const saved: Game[] = [];
    show([], (g) => saved.push(g));
    fireEvent.click(screen.getByRole("button", { name: "Log a game" }));
    fireEvent.change(screen.getByLabelText("Opponent"), { target: { value: "Redlands" } });
    fireEvent.change(screen.getByLabelText("Innings pitched"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Pitches"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("Strikes"), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText("Batters faced"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Save game" }));
    expect(saved).toHaveLength(0);
    expect(screen.getByText("More strikes than pitches — one of the two is wrong.")).toBeDefined();
  });

  it("refuses an innings figure that cannot exist", () => {
    const saved: Game[] = [];
    show([], (g) => saved.push(g));
    fireEvent.click(screen.getByRole("button", { name: "Log a game" }));
    fireEvent.change(screen.getByLabelText("Opponent"), { target: { value: "Redlands" } });
    // ".3" would be three thirds, which is the next whole inning.
    fireEvent.change(screen.getByLabelText("Innings pitched"), { target: { value: "3.3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save game" }));
    expect(saved).toHaveLength(0);
    expect(screen.getByText(/Innings must be written as the scorebook does/)).toBeDefined();
  });

  it("saves a coherent line as outs", () => {
    const saved: Game[] = [];
    show([], (g) => saved.push(g));
    fireEvent.click(screen.getByRole("button", { name: "Log a game" }));
    fireEvent.change(screen.getByLabelText("Opponent"), { target: { value: "Wynnum" } });
    fireEvent.change(screen.getByLabelText("Innings pitched"), { target: { value: "3.2" } });
    fireEvent.change(screen.getByLabelText("Batters faced"), { target: { value: "14" } });
    fireEvent.change(screen.getByLabelText("Pitches"), { target: { value: "58" } });
    fireEvent.change(screen.getByLabelText("Strikes"), { target: { value: "37" } });
    fireEvent.click(screen.getByRole("button", { name: "Save game" }));
    expect(saved).toHaveLength(1);
    expect(saved[0].outs).toBe(11);
    expect(saved[0].opponent).toBe("Wynnum");
  });

  it("claims nothing from a thin sample", () => {
    show([game({ outs: 9, pitches: 100, strikes: 20 })]);
    expect(screen.getByText(/read them as a description of what happened/)).toBeDefined();
    // The bad strike rate is on screen but not asserted as a finding.
    expect(screen.queryByText(/under the 62% mark/)).toBeNull();
  });

  it("dims a rate built on too little rather than hiding it", () => {
    show([game({ outs: 9 })]);
    expect(document.querySelectorAll(".rate-grid li.is-thin").length).toBeGreaterThan(0);
  });

  it("guards removing a game", () => {
    const removed: string[] = [];
    show([game()], () => {}, (id) => removed.push(id));
    fireEvent.click(screen.getByRole("button", { name: /^Remove the game against Coomera Cubs/ }));
    expect(removed).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /Confirm: remove the game against/ }));
    expect(removed).toEqual(["g1"]);
  });
});

/**
 * The ring's active-energy figure has been imported and stored since Apple
 * Health was connected, and displayed nowhere. It is context, not an input to
 * the target — the failure to avoid is it quietly becoming one.
 */
describe("active calories on the fuelling card", () => {
  const fuel = {
    demand: "moderate" as const,
    reason: "Bullpen day",
    calories: 3400,
    protein: 180,
    carbs: 450,
    fat: 95,
    fluid: 4.5,
    proteinFromLeanMass: true,
    energyFromMeasuredBmr: true,
  };

  const props = {
    api: new PitchingOsApi(),
    date: "2026-08-19",
    meals: [],
    hydrationLitres: 0,
    targets: { calories: 0, protein: 0, carbs: 0, fat: 0, fluid: 0 },
    onAddMeal: () => {},
    onRemoveMeal: () => {},
    onHydration: () => {},
  };

  it("shows the figure and says it is not in the target", () => {
    render(<Nutrition {...props} fuel={fuel} activeCalories={812.4} />);
    expect(screen.getByText(/812 kcal active today/)).toBeTruthy();
    expect(screen.getByText(/not added to the target above/)).toBeTruthy();
  });

  it("leaves the calorie target exactly where it was", () => {
    render(<Nutrition {...props} fuel={fuel} activeCalories={812} />);
    // The target is the fuelling figure alone — 3400, not 4212.
    expect(screen.getByText("3400")).toBeTruthy();
    expect(screen.queryByText("4212")).toBeNull();
  });

  it("says nothing at all when no ring data came in", () => {
    render(<Nutrition {...props} fuel={fuel} activeCalories={null} />);
    expect(screen.queryByText(/active today/)).toBeNull();
  });
});
