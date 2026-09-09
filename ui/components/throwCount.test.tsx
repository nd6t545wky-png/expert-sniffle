/**
 * The throw count, on the screen where the throwing gets ticked off.
 *
 * The behaviour worth pinning is the ownership rule: a count the app worked
 * out is a starting point, a count the athlete typed is the record, and the
 * card has to make the difference visible without making the correction a
 * chore. Everything else here is arithmetic the domain tests already cover.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ThrowCountCard } from "./ThrowCountCard";
import { ThrowTally } from "../../src/domain/throwCount";

afterEach(cleanup);

const tally = (over: Partial<ThrowTally> = {}): ThrowTally => ({
  throws: 58,
  intent: "moderate",
  sources: [
    { id: "a", name: "Pregame catch", throws: 25, intent: "moderate" },
    { id: "b", name: "Pregame bullpen", throws: 20, intent: "moderate" },
    { id: "c", name: "Plyo Ball Rocker Throw — 225 g", throws: 13, intent: "low" },
  ],
  unread: [],
  ...over,
});

function card(over: Record<string, unknown> = {}) {
  const onSave = vi.fn();
  const onUseAuto = vi.fn();
  render(
    <ThrowCountCard tally={tally()} entry={null} onSave={onSave} onUseAuto={onUseAuto} {...over} />
  );
  return { onSave, onUseAuto };
}

describe("the automatic count", () => {
  it("shows the total and how it got there", () => {
    card();
    expect(screen.getByText("58")).toBeTruthy();
    expect(screen.getByText("Pregame bullpen")).toBeTruthy();
    expect(screen.getByText(/From the session, as you tick it/)).toBeTruthy();
  });

  it("shows nothing at all before anything is ticked", () => {
    const { container } = render(
      <ThrowCountCard tally={null} entry={null} onSave={vi.fn()} onUseAuto={vi.fn()} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("names completed throwing that carries no dose", () => {
    // Otherwise the total quietly reads low and nothing says why.
    card({ tally: tally({ unread: ["High-intent pulldowns"] }) });
    expect(screen.getByText(/High-intent pulldowns states no throw count/)).toBeTruthy();
  });
});

describe("correcting it", () => {
  it("opens on the automatic figure, so a correction is one edit", () => {
    card();
    fireEvent.click(screen.getByRole("button", { name: "Threw more than this?" }));
    expect(screen.getByLabelText("Throws").getAttribute("value")).toBe("58");
  });

  it("records what the athlete typed, and the intent they reached", () => {
    const { onSave } = card();
    fireEvent.click(screen.getByRole("button", { name: "Threw more than this?" }));
    fireEvent.change(screen.getByLabelText("Throws"), { target: { value: "74" } });
    fireEvent.change(screen.getByLabelText("Hardest intent reached"), { target: { value: "high" } });
    fireEvent.click(screen.getByRole("button", { name: "Save count" }));
    expect(onSave).toHaveBeenCalledWith({ throws: 74, intent: "high" });
  });

  it("refuses a negative count rather than storing one", () => {
    const { onSave } = card();
    fireEvent.click(screen.getByRole("button", { name: "Threw more than this?" }));
    fireEvent.change(screen.getByLabelText("Throws"), { target: { value: "-5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save count" }));
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("once it is the athlete's number", () => {
  const entry = { date: "2026-09-11", throws: 74, intent: "high" as const, source: "manual" as const };

  it("shows theirs, says it is theirs, and keeps showing the session's", () => {
    card({ entry });
    expect(screen.getByText("74")).toBeTruthy();
    expect(screen.getByText(/Your count/)).toBeTruthy();
    expect(screen.getByText(/The session adds up to 58. You recorded 74./)).toBeTruthy();
  });

  it("offers the automatic figure back rather than taking it back", () => {
    const { onUseAuto } = card({ entry });
    fireEvent.click(screen.getByRole("button", { name: "Use 58" }));
    expect(onUseAuto).toHaveBeenCalled();
  });

  it("treats an entry stored before this existed as theirs", () => {
    // Everything written before the source field was added was typed by hand.
    card({ entry: { date: "2026-09-11", throws: 92, intent: "high" as const } });
    expect(screen.getByText(/Your count/)).toBeTruthy();
  });
});
