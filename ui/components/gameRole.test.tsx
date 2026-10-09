import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PitchingOsApi } from "../../src/domain/api";
import { HealthForm } from "./HealthForm";
import { GameRoleCard } from "./GameRole";

afterEach(cleanup);

const api = new PitchingOsApi({ fetcher: vi.fn() as never, syncKey: "a".repeat(64) });

function form(gameDay: boolean) {
  const submitted: { gameRole: unknown }[] = [];
  render(
    <HealthForm
      date="2026-10-09"
      plan={{ status: "locked", message: "Submit the check-in." }}
      existing={{}}
      onSubmitted={(_result, _date, detail) => submitted.push(detail)}
      api={api}
      prefill={{}}
      onPrefill={() => {}}
      hasSyncKey={false}
      gameDay={gameDay}
    />
  );
  return submitted;
}

describe("game-day check-in", () => {
  it("asks whether you are playing, and will not submit without an answer", () => {
    const submitted = form(true);
    fireEvent.submit(document.getElementById("pre-form")!);
    expect(submitted).toHaveLength(0);
    expect(screen.getByText(/Say whether you are playing today/)).toBeDefined();

    fireEvent.change(screen.getByLabelText("Are you playing today?"), { target: { value: "not_playing" } });
    fireEvent.submit(document.getElementById("pre-form")!);
    expect(submitted).toEqual([expect.objectContaining({ gameRole: "not_playing" })]);
  });

  it("does not ask on a day with no game", () => {
    const submitted = form(false);
    expect(screen.queryByLabelText("Are you playing today?")).toBeNull();
    fireEvent.submit(document.getElementById("pre-form")!);
    expect(submitted).toEqual([expect.objectContaining({ gameRole: null })]);
  });

  it("lets the answer change after the check-in", () => {
    const changes: string[] = [];
    render(<GameRoleCard value="pitching" onChange={(role) => changes.push(role)} />);
    fireEvent.change(screen.getByLabelText("Are you playing today?"), { target: { value: "playing" } });
    expect(changes).toEqual(["playing"]);
  });
});
