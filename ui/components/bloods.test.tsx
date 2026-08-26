/**
 * The blood page.
 *
 * Tested through the component because the risks here are presentational
 * rather than arithmetic. A page of blood results is the easiest place in this
 * app to imply a diagnosis by accident, so what follows checks two things
 * above all: that the disclaimer and the route to a doctor are always on the
 * page, and that the entry form keeps the reference range printed on the
 * athlete's own report rather than quietly falling back to a general one.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Bloods } from "./Bloods";
import { BloodPanel, DrawContext } from "../../src/domain/bloods";

afterEach(cleanup);

const NO_CONTEXT: DrawContext = {
  daysSinceHardThrow: null,
  hardThrowOn: null,
  throwsInWeek: 0,
  throwingDays: 0,
  meanSleepHours: null,
  tonnageKg: 0,
};

const context = (over: Partial<DrawContext> = {}): DrawContext => ({ ...NO_CONTEXT, ...over });

const panel = (date: string, results: BloodPanel["results"]): BloodPanel => ({ date, results });

function show(panels: BloodPanel[], onChange: (next: BloodPanel[]) => void = () => {}, draw = NO_CONTEXT) {
  return render(
    <Bloods panels={panels} today="2026-08-26" contextFor={() => draw} onChange={onChange} />
  );
}

describe("what the page promises", () => {
  it("says it does not read results, before it shows any", () => {
    show([]);
    expect(screen.getByText(/does not read your results/i)).toBeTruthy();
  });

  it("keeps saying it once there are results on screen", () => {
    show([panel("2026-08-20", { ferritin: { value: 64 } })]);
    expect(screen.getByText(/does not read your results/i)).toBeTruthy();
  });

  it("offers a first panel when there is nothing recorded", () => {
    show([]);
    expect(screen.getByText(/Nothing recorded yet/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add a panel" })).toBeTruthy();
  });
});

describe("reading a panel back", () => {
  it("shows the value, its range and where the range came from", () => {
    show([panel("2026-08-20", { ferritin: { value: 64, low: 20, high: 320 } })]);
    expect(screen.getByText("64 µg/L")).toBeTruthy();
    expect(screen.getByText("20–320")).toBeTruthy();
    expect(screen.getByText("your report")).toBeTruthy();
  });

  it("says when it is falling back to a general range instead", () => {
    show([panel("2026-08-20", { ferritin: { value: 64 } })]);
    expect(screen.getByText("typical range")).toBeTruthy();
  });

  it("shows the direction since the last panel that measured it", () => {
    show([
      panel("2026-08-20", { ferritin: { value: 42 } }),
      panel("2026-02-10", { ferritin: { value: 58 } }),
    ]);
    expect(screen.getByText(/-16 since 10 Feb 2026/)).toBeTruthy();
  });

  it("routes an out-of-range result to a doctor without explaining it", () => {
    show([panel("2026-08-20", { ferritin: { value: 8 } })]);
    expect(screen.getByText(/1 result is outside the range/)).toBeTruthy();
    const referral = screen.getByText(/book it in with your doctor/i);
    expect(referral).toBeTruthy();
    // The referral names the marker and nothing else. No cause, no mechanism,
    // no suggested action — those are the doctor's, and guessing at them here
    // is the one thing this page must never do.
    expect(referral.textContent).toContain("Ferritin");
    expect(referral.textContent).toMatch(/not a diagnosis/);
    expect(referral.textContent).not.toMatch(/deficien|supplement|low iron|treat/i);
  });

  it("does not raise a creatine kinase that is only doing what CK does", () => {
    show([panel("2026-08-20", { ck: { value: 1400 } })]);
    expect(screen.queryByText(/outside the range/)).toBeNull();
    expect(screen.getByText("Expected to vary")).toBeTruthy();
  });

  it("puts the training week beside the draw", () => {
    show(
      [panel("2026-08-20", { ck: { value: 1400 } })],
      () => {},
      context({ daysSinceHardThrow: 2, hardThrowOn: "2026-08-18", throwsInWeek: 92, throwingDays: 3 })
    );
    expect(screen.getByText(/2 days after the last high-intent throwing day/)).toBeTruthy();
  });

  it("lists earlier panels separately, and only when there are some", () => {
    const { unmount } = show([panel("2026-08-20", { ferritin: { value: 42 } })]);
    expect(screen.queryByText("Earlier panels")).toBeNull();
    unmount();

    show([
      panel("2026-08-20", { ferritin: { value: 42 } }),
      panel("2026-02-10", { ferritin: { value: 58 } }),
    ]);
    expect(screen.getByText("Earlier panels")).toBeTruthy();
  });

  it("removes an earlier panel without touching the current one", () => {
    const changes: BloodPanel[][] = [];
    show(
      [panel("2026-08-20", { ferritin: { value: 42 } }), panel("2026-02-10", { ferritin: { value: 58 } })],
      (next) => changes.push(next)
    );
    fireEvent.click(screen.getByRole("button", { name: /Remove the panel from 10 Feb 2026/ }));
    expect(changes[0].map((entry) => entry.date)).toEqual(["2026-08-20"]);
  });
});

describe("entering a panel", () => {
  function open() {
    const changes: BloodPanel[][] = [];
    show([], (next) => changes.push(next));
    fireEvent.click(screen.getByRole("button", { name: "Add a panel" }));
    return changes;
  }

  it("saves only the markers that were actually entered", () => {
    const changes = open();
    fireEvent.change(screen.getByLabelText("Ferritin µg/L"), { target: { value: "64" } });
    fireEvent.click(screen.getByRole("button", { name: "Save panel" }));
    expect(Object.keys(changes[0][0].results)).toEqual(["ferritin"]);
    expect(changes[0][0].results.ferritin.value).toBe(64);
  });

  it("keeps the range printed beside the result", () => {
    const changes = open();
    fireEvent.change(screen.getByLabelText("Ferritin µg/L"), { target: { value: "64" } });
    fireEvent.change(screen.getByLabelText("Ferritin range low"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("Ferritin range high"), { target: { value: "320" } });
    fireEvent.click(screen.getByRole("button", { name: "Save panel" }));
    expect(changes[0][0].results.ferritin).toEqual({ value: 64, low: 20, high: 320 });
  });

  it("accepts a one-sided range, which is how CRP is usually printed", () => {
    const changes = open();
    fireEvent.change(screen.getByLabelText("hs-CRP mg/L"), { target: { value: "1.2" } });
    fireEvent.change(screen.getByLabelText("hs-CRP range high"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save panel" }));
    const saved = Object.values(changes[0][0].results)[0];
    expect(saved.high).toBe(5);
    expect(saved.low).toBeUndefined();
  });

  it("does nothing at all when nothing was entered", () => {
    const changes = open();
    fireEvent.click(screen.getByRole("button", { name: "Save panel" }));
    expect(changes).toHaveLength(0);
  });

  it("replaces a panel drawn on the same day rather than doubling it", () => {
    // Re-entering a date is a correction to a mistyped result.
    const changes: BloodPanel[][] = [];
    show([panel("2026-08-20", { ferritin: { value: 42 } })], (next) => changes.push(next));
    fireEvent.click(screen.getByRole("button", { name: "Add a panel" }));
    fireEvent.change(screen.getByLabelText("Date of the draw"), { target: { value: "2026-08-20" } });
    fireEvent.change(screen.getByLabelText("Ferritin µg/L"), { target: { value: "64" } });
    fireEvent.click(screen.getByRole("button", { name: "Save panel" }));
    expect(changes[0]).toHaveLength(1);
    expect(changes[0][0].results.ferritin.value).toBe(64);
  });
});
