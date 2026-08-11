/**
 * Typed client for the Worker API.
 *
 * Transport only: no React, no DOM, no globals beyond `fetch`, which is
 * injectable so every call can be tested without a network. Endpoint paths
 * and auth shapes mirror `src/index.ts`.
 */

import { IsoDate } from "./state";
import { SyncGetResponse, SyncPutResponse } from "./sync";

export type Fetcher = typeof fetch;

export interface ApiOptions {
  fetcher?: Fetcher;
  /** Bearer token: the 64-hex sync key. Required by most routes. */
  syncKey?: string;
  baseUrl?: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class PitchingOsApi {
  private readonly fetcher: Fetcher;
  private readonly baseUrl: string;
  private syncKey?: string;

  constructor(options: ApiOptions = {}) {
    this.fetcher = options.fetcher ?? ((...args) => fetch(...args));
    this.baseUrl = options.baseUrl ?? "";
    this.syncKey = options.syncKey;
  }

  setSyncKey(syncKey: string | undefined) {
    this.syncKey = syncKey;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = { ...extra };
    if (this.syncKey) headers.Authorization = `Bearer ${this.syncKey}`;
    return headers;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers: this.headers(init.headers as Record<string, string>),
    });

    const text = await response.text();
    let body: unknown = undefined;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    if (!response.ok) {
      const message =
        body && typeof body === "object" && "error" in body
          ? String((body as { error: unknown }).error)
          : `Request failed (${response.status})`;
      throw new ApiError(message, response.status, body);
    }
    return body as T;
  }

  // --- health ---------------------------------------------------------------

  health() {
    return this.request<{ ok: boolean }>("/api/health");
  }

  // --- account --------------------------------------------------------------

  accountStatus() {
    return this.request<{
      signedIn: boolean;
      workspaceReady: boolean;
      user?: { id: string; name: string; email: string; image: string };
      syncKey?: string;
      updatedAt?: string;
    }>("/api/account/status");
  }

  createWorkspace(legacySyncKey?: string) {
    return this.request<{ workspaceReady: boolean; syncKey: string; adoptedExistingData: boolean; updatedAt: string }>(
      "/api/account/workspace",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(legacySyncKey ? { legacySyncKey } : {}),
      }
    );
  }

  deleteAccount() {
    return this.request<{ deleted: boolean }>("/api/account", { method: "DELETE" });
  }

  // --- sync -----------------------------------------------------------------

  getSync() {
    return this.request<SyncGetResponse>("/api/sync");
  }

  putSync(payload: string, expectedRevision: number) {
    return this.request<SyncPutResponse>("/api/sync", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload, expectedRevision }),
    });
  }

  deleteSync() {
    return this.request<{ deleted: boolean }>("/api/sync", { method: "DELETE" });
  }

  // --- integrations: Oura ----------------------------------------------------

  ouraStatus() {
    return this.request<{ configured: boolean; connected: boolean; scopes: string; updatedAt: string }>(
      "/api/integrations/oura/status"
    );
  }

  ouraConnect() {
    return this.request<{ authorizeUrl: string }>("/api/integrations/oura/connect", { method: "POST" });
  }

  ouraDisconnect() {
    return this.request<{ disconnected: boolean }>("/api/integrations/oura", { method: "DELETE" });
  }

  // --- integrations: Apple Health --------------------------------------------

  appleStatus() {
    return this.request<{ connected: boolean; createdAt: string; lastUploadAt: string }>(
      "/api/integrations/apple/status"
    );
  }

  /** Returns the upload token once. It is never retrievable again. */
  appleSetup() {
    return this.request<{ connected: boolean; uploadToken: string; endpoint: string; note: string }>(
      "/api/integrations/apple/setup",
      { method: "POST" }
    );
  }

  appleDisconnect() {
    return this.request<{ disconnected: boolean }>("/api/integrations/apple", { method: "DELETE" });
  }

  // --- health data -----------------------------------------------------------

  dailyHealth(day: IsoDate, refresh = false) {
    return this.request<DailyHealthResponse>(
      `/api/integrations/daily?day=${encodeURIComponent(day)}${refresh ? "&refresh=1" : ""}`
    );
  }

  healthHistory(end: IsoDate, days = 28, refresh = false) {
    return this.request<HealthHistoryResponse>(
      `/api/integrations/history?end=${encodeURIComponent(end)}&days=${days}${refresh ? "&refresh=1" : ""}`
    );
  }

  // --- session photos --------------------------------------------------------

  /**
   * The photo for a day, as bytes.
   *
   * Served against the bearer key rather than a signed URL, so the caller gets
   * a Blob to turn into an object URL. A link that worked outside the app
   * would be a private training photo on a public URL.
   */
  async sessionPhoto(day: IsoDate): Promise<Blob | null> {
    const response = await this.fetcher(`${this.baseUrl}/api/session-photos/${encodeURIComponent(day)}`, {
      headers: this.headers(),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new ApiError("Could not load the session photo", response.status);
    return response.blob();
  }

  uploadSessionPhoto(day: IsoDate, file: Blob) {
    return this.request<{ saved: boolean; day: IsoDate; byteSize: number }>(
      `/api/session-photos/${encodeURIComponent(day)}`,
      { method: "PUT", headers: { "Content-Type": file.type }, body: file }
    );
  }

  deleteSessionPhoto(day: IsoDate) {
    return this.request<{ deleted: boolean; day: IsoDate }>(
      `/api/session-photos/${encodeURIComponent(day)}`,
      { method: "DELETE" }
    );
  }

  listSessionPhotos() {
    return this.request<{ days: IsoDate[] }>("/api/session-photos");
  }

  // --- mechanics -------------------------------------------------------------

  listMechanicsVideos() {
    return this.request<{ videos: MechanicsVideo[] }>("/api/mechanics/videos");
  }

  uploadMechanicsVideo(id: string, file: Blob, params: MechanicsUploadParams) {
    const query = new URLSearchParams();
    if (params.fileName) query.set("fileName", params.fileName);
    if (params.angle) query.set("angle", params.angle);
    if (params.capturedOn) query.set("capturedOn", params.capturedOn);
    if (params.pitchContext) query.set("pitchContext", params.pitchContext);
    if (params.notes) query.set("notes", params.notes);
    return this.request<{ saved: boolean; id: string; playbackUrl: string }>(
      `/api/mechanics/videos/${encodeURIComponent(id)}?${query}`,
      { method: "PUT", headers: { "Content-Type": file.type }, body: file }
    );
  }

  deleteMechanicsVideo(id: string) {
    return this.request<{ deleted: boolean }>(`/api/mechanics/videos/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  analyzeMechanics(contactSheet: Blob, params: { angle: MechanicsAngle; capturedOn: IsoDate; pitchContext?: string }) {
    const query = new URLSearchParams({ angle: params.angle, capturedOn: params.capturedOn });
    if (params.pitchContext) query.set("pitchContext", params.pitchContext);
    return this.request<{ analysis: MechanicsAnalysis }>(`/api/mechanics/analyze?${query}`, {
      method: "POST",
      headers: { "Content-Type": contactSheet.type },
      body: contactSheet,
    });
  }

  // --- nutrition -------------------------------------------------------------

  analyzeMealPhoto(photo: Blob, day: IsoDate, notes?: string) {
    const query = new URLSearchParams({ day });
    if (notes) query.set("notes", notes);
    return this.request<{ estimate: NutritionEstimate; photoRetained: boolean; notice: string }>(
      `/api/nutrition/analyze?${query}`,
      { method: "POST", headers: { "Content-Type": photo.type }, body: photo }
    );
  }

  analyzeMealText(description: string, day: IsoDate) {
    return this.request<MealTextResponse>("/api/nutrition/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, day }),
    });
  }

  lookupBarcode(code: string) {
    return this.request<{ found: boolean; code?: string; product?: FoodProduct }>(
      `/api/nutrition/barcode?code=${encodeURIComponent(code)}`
    );
  }

  searchFood(query: string) {
    return this.request<{ query: string; results: FoodProduct[]; source: string }>(
      `/api/nutrition/search?query=${encodeURIComponent(query)}`
    );
  }

  lookupRestaurant(restaurant: string, item: string) {
    return this.request<{ found: boolean; reason?: string; result?: RestaurantNutrition }>(
      `/api/nutrition/restaurant?restaurant=${encodeURIComponent(restaurant)}&item=${encodeURIComponent(item)}`
    );
  }

  // --- training history ------------------------------------------------------

  getHistory(params: { start?: IsoDate; end?: IsoDate; limit?: number } = {}) {
    const query = new URLSearchParams();
    if (params.start) query.set("start", params.start);
    if (params.end) query.set("end", params.end);
    if (params.limit) query.set("limit", String(params.limit));
    return this.request<{ events: HistoryEvent[]; limit: number; nextCursor: unknown }>(`/api/history?${query}`);
  }

  postHistory(events: HistoryEventInput[]) {
    return this.request<{ saved: boolean; accepted: number; inserted: number; createdAt: string }>("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
    });
  }
}

// --- response shapes ----------------------------------------------------------

export type MechanicsAngle = "open_side" | "rear" | "dual";

export interface MechanicsUploadParams {
  fileName?: string;
  angle?: MechanicsAngle;
  capturedOn?: IsoDate;
  pitchContext?: string;
  notes?: string;
}

export interface MechanicsVideo {
  id: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  angle: string;
  capturedOn: string;
  pitchContext: string;
  notes: string;
  createdAt: string;
  playbackUrl: string;
}

export interface MechanicsAnalysis {
  source: string;
  sourceLabel: string;
  analyzable: boolean;
  captureQuality: { score: number; decision: string; blockers: string[] };
  summary: string;
  confidence: string;
  confidenceReason: string;
  sequenceRating: number | null;
  lowerHalfRating: number | null;
  trunkRating: number | null;
  armTimingRating: number | null;
  releaseRating: number | null;
  decelerationRating: number | null;
  screening: Record<string, string>;
  phaseReview: unknown[];
  observations: unknown[];
  limitations: string[];
  aiInterventions: { issue: string; rationale: string }[];
  model: string;
  analyzedAt: string;
}

export interface HealthSummary {
  sleepHours: number | null;
  sleepScore: number | null;
  readinessScore: number | null;
  restingHeartRate: number | null;
  hrvMs: number | null;
  bodyweightKg: number | null;
  [key: string]: unknown;
}

export interface DailyHealthResponse {
  day: IsoDate;
  merged: HealthSummary;
  sources: {
    oura: { connected: boolean; data: HealthSummary | null; updatedAt: string; error: string };
    appleHealth: { connected: boolean; data: HealthSummary | null; updatedAt: string };
  };
}

export interface HealthHistoryResponse {
  startDay: IsoDate;
  endDay: IsoDate;
  days: number;
  /**
   * Each day carries the same `merged` + `sources` shape as the daily route,
   * so a history record can be stored into `healthPrefill` as-is. `merged`
   * holds a narrower field set here, but `sources.oura.data` is the full
   * summary either way — which is what the trend charts read.
   */
  records: Record<
    IsoDate,
    {
      day: IsoDate;
      merged: HealthSummary;
      sources?: {
        oura: { connected: boolean; data: HealthSummary | null; updatedAt: string; error: string };
        appleHealth: { connected: boolean; data: HealthSummary | null; updatedAt: string };
      };
    }
  >;
  refreshError: string;
}

export interface NutritionEstimate {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: string;
  items: string[];
  assumptions: string[];
  serving?: string;
}

export interface MealTextResponse {
  estimate: NutritionEstimate;
  source: string;
  brandOrMenuDetected: boolean;
  officialMatch: boolean;
  sourceUrl: string;
  sourceTitle: string;
  evidence: string;
  notice: string;
}

export interface FoodProduct {
  code: string;
  name: string;
  brand: string;
  servingSize: string;
  servingQuantity: number | null;
  per100g: Record<string, number | null>;
  perServing: Record<string, number | null> | null;
  imageUrl: string;
  dataWarnings: string[];
}

export interface RestaurantNutrition {
  name: string;
  serving: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  confidence: string;
  evidence: string;
  sourceUrl: string;
  sourceTitle: string;
}

export interface HistoryEvent {
  id: string;
  eventType: string;
  sessionDay: IsoDate;
  occurredAt: string;
  encryptedPayload: string;
  createdAt: string;
}

export interface HistoryEventInput {
  id: string;
  eventType: string;
  sessionDay: IsoDate;
  occurredAt: string;
  encryptedPayload: string;
}
