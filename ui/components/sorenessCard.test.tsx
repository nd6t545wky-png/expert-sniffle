/**
 * The reporting card, from the outside.
 *
 * The domain tests prove the triage is right. These prove the athlete can
 * actually reach it: that four taps produce a well-formed report, that the
 * verdict and its reasoning are both on screen, and that a referral is not
 * something you have to open a disclosure to find.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SorenessCard } from "./SorenessCard";
import {
  QUALITY_LABELS,
  REGION_LABELS,
  SorenessReport,
  TIMING_LABELS,
  activeReports,
} from "../../src/domain/soreness";

const TODAY = "2026-08-19";

afterEach(cleanup);

function report(overrides: Partial<SorenessReport> = {}): SorenessReport {
  return {
    id: "r1",
    date: TODAY,
    region: "elbow_medial",
    severity: 7,
    quality: "ache",
    timing: "during",
    trend: "same",
    createdAt: `${TODAY}T08:00:00.000Z`,
    ...overrides,
  };
}

/**
 * Open the report form.
 *
 * With nothing sore the card is a single line, so every test that fills the
 * form opens it first — the same tap the athlete makes.
 */
function openForm() {
  fireEvent.click(screen.getByRole("button", { name: /something sore\?/i }));
}

function renderCard(props: Partial<React.ComponentProps<typeof SorenessCard>> = {}) {
  const saved: SorenessReport[] = [];
  const resolved: string[] = [];
  render(
    <SorenessCard
      date={TODAY}
      active={[]}
      onReport={(entry) => saved.push(entry)}
      onResolve={(region) => resolved.push(region)}
      {...props}
    />
  );
  return { saved, resolved };
}

describe("making a report", () => {
  it("takes four taps and a slider", () => {
    const { saved } = renderCard();
    openForm();

    fireEvent.click(screen.getByRole("button", { name: new RegExp(REGION_LABELS.elbow_medial, "i") }));
    fireEvent.change(screen.getByLabelText(/severity out of 10/i), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: new RegExp(QUALITY_LABELS.sharp, "i") }));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(TIMING_LABELS.next_morning, "i") }));
    fireEvent.click(screen.getByRole("button", { name: /^save/i }));

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      date: TODAY,
      region: "elbow_medial",
      severity: 7,
      quality: "sharp",
      timing: "next_morning",
    });
    expect(saved[0].id).toBeTruthy();
    expect(saved[0].createdAt).toBeTruthy();
  });

  it("will not save without a region, because the region is the prescription", () => {
    renderCard();
    openForm();
    const save = screen.getByRole("button", { name: /pick where it hurts/i });
    expect((save as HTMLButtonElement).disabled).toBe(true);
  });

  it("offers the pitcher's regions first and the rest behind one tap", () => {
    renderCard();
    openForm();
    expect(screen.queryByRole("button", { name: new RegExp(REGION_LABELS.knee, "i") })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /somewhere else/i }));
    expect(screen.getByRole("button", { name: new RegExp(REGION_LABELS.knee, "i") })).toBeTruthy();
  });

  it("keeps an optional note with the report", () => {
    const { saved } = renderCard();
    openForm();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(REGION_LABELS.forearm, "i") }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Came on in the fourth" } });
    fireEvent.click(screen.getByRole("button", { name: /^save/i }));
    expect(saved[0].note).toBe("Came on in the fourth");
  });
});

describe("showing what it decided", () => {
  it("shows the verdict and the reasoning behind it", () => {
    renderCard({ active: activeReports([report({ severity: 7 })], TODAY) });
    expect(screen.getByText(/rest this area today/i)).toBeTruthy();
    // Not just the verdict — every rule that fired, so it can be argued with.
    expect(screen.getByText(/severity 7\/10/i)).toBeTruthy();
  });

  it("shows a referral as an alert, not buried in a disclosure", () => {
    renderCard({ referral: "Burning is a nerve description, not a load description." });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/nerve description/i);
    expect(alert.textContent).toMatch(/get this one looked at/i);
  });

  it("offers the physio link from the referral", () => {
    let opened = 0;
    render(
      <SorenessCard
        date={TODAY}
        active={[]}
        referral="Needs examining."
        onOpenShare={() => (opened += 1)}
        onReport={() => {}}
        onResolve={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /send your physio the link/i }));
    expect(opened).toBe(1);
  });

  it("lists what actually changed in the plan", () => {
    renderCard({
      active: activeReports([report()], TODAY),
      changes: [
        { kind: "removed", region: "elbow_medial", text: "Chin-up is out — it loads the inside of elbow." },
        { kind: "added", region: "elbow_medial", text: "Wrist flexion isometric — 5 × 45 s holds." },
      ],
    });
    expect(screen.getByText(/what changed in today/i)).toBeTruthy();
    expect(screen.getByText(/Chin-up is out/)).toBeTruthy();
    expect(screen.getByText(/5 × 45 s holds/)).toBeTruthy();
  });

  it("says how many days it has been running", () => {
    const reports = [report({ id: "a", date: "2026-08-16" }), report({ id: "b", date: TODAY })];
    renderCard({ active: activeReports(reports, TODAY) });
    expect(screen.getByText(/day 4/i)).toBeTruthy();
  });
});

describe("closing one out", () => {
  it("asks before clearing, then clears", () => {
    const { resolved } = renderCard({ active: activeReports([report()], TODAY) });
    fireEvent.click(screen.getByRole("button", { name: /it has gone the inside of elbow report/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(resolved).toEqual(["elbow_medial"]);
  });

  it("asks about a stale report rather than acting on it", () => {
    // Nine days old and never mentioned again: the app must not keep quietly
    // rewriting the plan around it.
    const stale = activeReports([report({ date: "2026-08-05" })], TODAY);
    expect(stale[0].stale).toBe(true);
    const { resolved } = renderCard({ active: stale });
    expect(screen.getByText(/is your inside of elbow still sore/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /it has gone/i }));
    expect(resolved).toEqual(["elbow_medial"]);
  });

  it("says plainly that it is not a diagnosis, once it is open", () => {
    renderCard();
    openForm();
    expect(screen.getByText(/does not diagnose anything/i)).toBeTruthy();
  });
});

/**
 * The quiet state.
 *
 * The full card sat above the session heading with the loudest button on the
 * page, so on every day nothing hurt the athlete scrolled past an injury form
 * to reach their training. It collapses — but only when there is genuinely
 * nothing to say, which is the part worth pinning down.
 */
describe("when nothing is sore", () => {
  it("collapses to one line that still opens the form", () => {
    const { saved } = renderCard();
    expect(screen.getByText(/nothing reported sore/i)).toBeTruthy();
    // The heavy card is not rendered at all.
    expect(screen.queryByText(/does not diagnose anything/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /report something sore/i })).toBeNull();

    openForm();
    expect(screen.getByText(/where\?/i)).toBeTruthy();
    expect(saved).toHaveLength(0);
  });

  it("stays open once the form has been opened", () => {
    renderCard();
    openForm();
    expect(screen.queryByText(/nothing reported sore/i)).toBeNull();
  });

  it("does not collapse while something is reported", () => {
    renderCard({ active: activeReports([report()], TODAY) });
    expect(screen.queryByText(/nothing reported sore/i)).toBeNull();
    expect(screen.getByText(/rest this area today/i)).toBeTruthy();
  });

  it("does not collapse while a referral is standing", () => {
    renderCard({ referral: "Needs examining." });
    expect(screen.queryByText(/nothing reported sore/i)).toBeNull();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("does not collapse while a stale report needs re-confirming", () => {
    renderCard({ active: activeReports([report({ date: "2026-08-05" })], TODAY) });
    expect(screen.queryByText(/nothing reported sore/i)).toBeNull();
    // The prompt, not the button beside it — both say "still sore".
    expect(screen.getByText(/is your inside of elbow still sore/i)).toBeTruthy();
  });

  it("does not collapse while the plan is showing changes", () => {
    // A resolved report can leave changes on the day; hiding the explanation
    // would leave the plan looking altered for no stated reason.
    renderCard({
      changes: [{ kind: "removed", region: "knee", text: "Broad jump is out — it loads the knee." }],
    });
    expect(screen.queryByText(/nothing reported sore/i)).toBeNull();
    expect(screen.getByText(/what changed in today/i)).toBeTruthy();
  });
});
