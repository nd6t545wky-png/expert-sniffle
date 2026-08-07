import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DailyPlan } from "./DailyPlan";
import { AnnualPlan } from "./AnnualPlan";
import { Workload } from "./Workload";
import { PlanState, ReadinessSubmission } from "../../src/domain/session";

const WEDNESDAY = "2026-08-05";
const THURSDAY = "2026-08-06";

const unlocked: PlanState = { status: "unlocked", planLevel: "full", workloadFactor: 1 };
const locked: PlanState = { status: "locked", message: "Complete the pre-session readiness check to unlock this session." };
const held: PlanState = { status: "held", workloadFactor: 0, message: "Health hold." };

const TASKS = [{ id: "warmup", name: "Warm-up", prescription: "Band series" }];

function submission(overrides: Partial<ReadinessSubmission> = {}): ReadinessSubmission {
  return {
    date: WEDNESDAY,
    score: 70,
    risk: "yellow",
    planLevel: "reduced",
    workloadFactor: 0.75,
    submittedAt: "2026-08-05T09:00:00.000Z",
    ...overrides,
  };
}

describe("DailyPlan — the readiness gate is visible in the UI", () => {
  it("shows the session as locked before readiness is submitted", () => {
    render(
      <DailyPlan date={WEDNESDAY} plan={locked} tasks={TASKS} completed={{}} onCompleteTask={vi.fn()} onOverride={vi.fn()} />
    );
    // The locked state now renders the prototype's gate card.
    expect(screen.getByText(/Health check-in required/)).toBeDefined();
    // Tasks must not be reachable while locked.
    expect(screen.queryByText("Warm-up")).toBeNull();
  });

  it("shows tasks once unlocked", () => {
    render(
      <DailyPlan date={WEDNESDAY} plan={unlocked} tasks={TASKS} completed={{}} onCompleteTask={vi.fn()} onOverride={vi.fn()} />
    );
    expect(screen.getByText("Warm-up")).toBeDefined();
  });

  it("surfaces a health hold", () => {
    render(
      <DailyPlan date={WEDNESDAY} plan={held} tasks={TASKS} completed={{}} onCompleteTask={vi.fn()} onOverride={vi.fn()} />
    );
    expect(screen.getByRole("alert").textContent).toContain("Health hold");
  });

  it("reports a completed task upward and marks it done", () => {
    const onCompleteTask = vi.fn();
    render(
      <DailyPlan date={WEDNESDAY} plan={unlocked} tasks={TASKS} completed={{}} onCompleteTask={onCompleteTask} onOverride={vi.fn()} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Mark complete" }));
    expect(onCompleteTask).toHaveBeenCalledWith(WEDNESDAY, "warmup", ["warmup"]);
  });

  it("does not offer completion twice for the same task", () => {
    render(
      <DailyPlan
        date={WEDNESDAY}
        plan={unlocked}
        tasks={TASKS}
        completed={{ [WEDNESDAY]: ["warmup"] }}
        onCompleteTask={vi.fn()}
        onOverride={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Logged" }).hasAttribute("disabled")).toBe(true);
  });

  it("requires a reason before overriding a reduced plan", () => {
    const onOverride = vi.fn();
    render(
      <DailyPlan
        date={WEDNESDAY}
        plan={{ status: "unlocked", planLevel: "reduced", workloadFactor: 0.75 }}
        submission={submission()}
        tasks={TASKS}
        completed={{}}
        onCompleteTask={vi.fn()}
        onOverride={onOverride}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Override to full" }));
    expect(onOverride).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("reason");
  });

  it("accepts an override once a reason is given", () => {
    const onOverride = vi.fn();
    render(
      <DailyPlan
        date={WEDNESDAY}
        plan={{ status: "unlocked", planLevel: "reduced", workloadFactor: 0.75 }}
        submission={submission()}
        tasks={TASKS}
        completed={{}}
        onCompleteTask={vi.fn()}
        onOverride={onOverride}
      />
    );
    fireEvent.change(screen.getByPlaceholderText(/Why is the full session/), { target: { value: "warmed up well" } });
    fireEvent.click(screen.getByRole("button", { name: "Override to full" }));
    expect(onOverride).toHaveBeenCalled();
    expect(onOverride.mock.calls[0][1].reason).toBe("warmed up well");
  });

  it("offers no override under a health hold", () => {
    render(
      <DailyPlan
        date={WEDNESDAY}
        plan={held}
        submission={submission({ planLevel: "hold", risk: "red" })}
        tasks={TASKS}
        completed={{}}
        onCompleteTask={vi.fn()}
        onOverride={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "Override to full" })).toBeNull();
  });
});

describe("Workload — high-intent restriction reaches the user", () => {
  it("refuses high intent on a non-permitted day and explains why", () => {
    const onLog = vi.fn();
    render(<Workload date={THURSDAY} plan={unlocked} entries={[]} onLog={onLog} />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "high" } });
    fireEvent.click(screen.getByRole("button", { name: "Log throwing" }));

    expect(onLog).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("Wednesday and Saturday");
  });

  it("permits high intent on Wednesday", () => {
    const onLog = vi.fn();
    render(<Workload date={WEDNESDAY} plan={unlocked} entries={[]} onLog={onLog} />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "high" } });
    fireEvent.click(screen.getByRole("button", { name: "Log throwing" }));

    expect(onLog).toHaveBeenCalled();
    expect(onLog.mock.calls[0][0].intent).toBe("high");
  });

  it("allows lower intents on any day", () => {
    const onLog = vi.fn();
    render(<Workload date={THURSDAY} plan={unlocked} entries={[]} onLog={onLog} />);
    fireEvent.click(screen.getByRole("button", { name: "Log throwing" }));
    expect(onLog).toHaveBeenCalled();
  });

  it("says so plainly when there is not enough history for a ratio", () => {
    render(<Workload date={WEDNESDAY} plan={unlocked} entries={[]} onLog={vi.fn()} />);
    expect(screen.getByText("Not enough history")).toBeDefined();
  });
});

describe("AnnualPlan", () => {
  it("renders all 52 weeks", () => {
    render(<AnnualPlan selectedWeek={1} onSelectWeek={vi.fn()} />);
    expect(screen.getAllByRole("button")).toHaveLength(52);
  });

  it("labels each week with its phase", () => {
    render(<AnnualPlan selectedWeek={1} onSelectWeek={vi.fn()} />);
    expect(screen.getByLabelText("Week 1, Winter Ball")).toBeDefined();
    expect(screen.getByLabelText("Week 13, Transition")).toBeDefined();
    expect(screen.getByLabelText("Week 15, Velocity Development")).toBeDefined();
    expect(screen.getByLabelText("Week 27, Preseason")).toBeDefined();
    expect(screen.getByLabelText("Week 37, Summer Season")).toBeDefined();
  });

  it("reports the position within the phase, not the year", () => {
    render(<AnnualPlan selectedWeek={20} onSelectWeek={vi.fn()} />);
    expect(screen.getByText(/week 6 of 12/)).toBeDefined();
  });

  it("reports selection upward", () => {
    const onSelectWeek = vi.fn();
    render(<AnnualPlan selectedWeek={1} onSelectWeek={onSelectWeek} />);
    fireEvent.click(screen.getByLabelText("Week 30, Preseason"));
    expect(onSelectWeek).toHaveBeenCalledWith(30);
  });
});
