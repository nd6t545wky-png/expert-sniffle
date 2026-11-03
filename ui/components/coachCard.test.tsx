import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PitchingOsApi } from "../../src/domain/api";
import { CoachCard, CoachRequestCard } from "./CoachCard";

const KEY = "b".repeat(64);

function fakeApi() {
  const calls: string[] = [];
  const fetcher = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    const path = String(url);
    calls.push(`${init.method ?? "GET"} ${path}`);
    const body =
      path === "/api/coach/athletes"
        ? {
            athletes: [
              { id: "luke123", name: "Luke Krkovski", access: "active" },
              { id: "ty45678", name: "Ty Iddon", access: "none" },
            ],
          }
        : path.endsWith("/open")
          ? { athlete: { id: "luke123", name: "Luke Krkovski" }, syncKey: KEY }
          : { access: "pending" };
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { api: new PitchingOsApi({ fetcher }), calls };
}

describe("CoachCard", () => {
  it("opens an athlete who allowed it, and asks one who has not", async () => {
    const { api, calls } = fakeApi();
    const onOpen = vi.fn();
    render(<CoachCard api={api} onOpen={onOpen} />);

    fireEvent.click(await screen.findByRole("button", { name: "Open Luke's app" }));
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith({ id: "luke123", name: "Luke Krkovski" }, KEY));

    fireEvent.click(screen.getByRole("button", { name: "Ask to coach" }));
    expect(await screen.findByText("Asked · waiting for them to allow")).toBeTruthy();
    expect(calls).toContain("POST /api/coach/athletes/ty45678");
  });
});

describe("CoachRequestCard", () => {
  it("lets the athlete allow or decline a request", async () => {
    const onAnswer = vi.fn(async () => undefined);
    render(<CoachRequestCard coach={{ name: "Dylan", access: "pending" }} onAnswer={onAnswer} onEnd={vi.fn()} />);
    expect(screen.getByText("Dylan wants to coach you")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Allow" }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(true));
  });

  it("lets the athlete remove access already given", async () => {
    const onEnd = vi.fn(async () => undefined);
    render(<CoachRequestCard coach={{ name: "Dylan", access: "active" }} onAnswer={vi.fn()} onEnd={onEnd} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove coach access" }));
    await waitFor(() => expect(onEnd).toHaveBeenCalled());
  });
});
