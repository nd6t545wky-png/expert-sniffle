import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DailyPlan, DailyPlanProps } from "./DailyPlan";
import { DayTabs, dayStatus } from "./DayTabs";
import { AnnualPlan } from "./AnnualPlan";
import { Workload } from "./Workload";
import { PlanState, ReadinessSubmission } from "../../src/domain/session";
import { SessionTask } from "../../src/domain/programmeSessions";

const WEDNESDAY = "2026-08-05";
const THURSDAY = "2026-08-06";

const unlocked: PlanState = { status: "unlocked", planLevel: "full", workloadFactor: 1 };
const locked: PlanState = { status: "locked", message: "Complete the pre-session readiness check to unlock this session." };
const held: PlanState = { status: "held", workloadFactor: 0, message: "Health hold." };

function task(overrides: Partial<SessionTask> = {}): SessionTask {
  return {
    id: "warmup",
    stage: 1,
    stageTitle: "Preparation",
    stageDescription: "Raise temperature and prime the movement",
    name: "Warm-up",
    prescription: "Band series",
    cue: "Move through full range without forcing it.",
    ...overrides,
  };
}

const TASKS = [task()];

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
      <DailyPlan date={WEDNESDAY} plan={locked} tasks={TASKS} completed={{}} skipped={{}} onCompleteTask={vi.fn()} onSkipTask={vi.fn()} onOverride={vi.fn()} />
    );
    // The locked state now renders the prototype's gate card.
    expect(screen.getByText(/Health check-in required/)).toBeDefined();
    // Tasks must not be reachable while locked.
    expect(screen.queryByText("Warm-up")).toBeNull();
  });

  it("shows tasks once unlocked", () => {
    render(
      <DailyPlan date={WEDNESDAY} plan={unlocked} tasks={TASKS} completed={{}} skipped={{}} onCompleteTask={vi.fn()} onSkipTask={vi.fn()} onOverride={vi.fn()} />
    );
    expect(screen.getByText("Warm-up")).toBeDefined();
  });

  it("surfaces a health hold", () => {
    render(
      <DailyPlan date={WEDNESDAY} plan={held} tasks={TASKS} completed={{}} skipped={{}} onCompleteTask={vi.fn()} onSkipTask={vi.fn()} onOverride={vi.fn()} />
    );
    expect(screen.getByRole("alert").textContent).toContain("Health hold");
  });

  it("reports a completed task upward when its checkbox is ticked", () => {
    const onCompleteTask = vi.fn();
    render(
      <DailyPlan date={WEDNESDAY} plan={unlocked} tasks={TASKS} completed={{}} skipped={{}} onCompleteTask={onCompleteTask} onSkipTask={vi.fn()} onOverride={vi.fn()} />
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Complete Warm-up" }));
    expect(onCompleteTask).toHaveBeenCalledWith(WEDNESDAY, "warmup", ["warmup"]);
  });

  it("shows a completed task as ticked, and un-ticking returns it to the plan", () => {
    const onCompleteTask = vi.fn();
    render(
      <DailyPlan
        date={WEDNESDAY}
        plan={unlocked}
        tasks={TASKS}
        completed={{ [WEDNESDAY]: ["warmup"] }}
        skipped={{}}
        onCompleteTask={onCompleteTask}
        onSkipTask={vi.fn()}
        onOverride={vi.fn()}
      />
    );
    const box = screen.getByRole("checkbox", { name: "Complete Warm-up" }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(onCompleteTask).toHaveBeenCalledWith(WEDNESDAY, "warmup", []);
  });

  it("groups tasks into stages and reports each stage's progress", () => {
    render(
      <DailyPlan
        date={WEDNESDAY}
        plan={unlocked}
        tasks={[
          task(),
          task({ id: "throw", stage: 2, stageTitle: "Throwing", name: "Catch play" }),
        ]}
        completed={{ [WEDNESDAY]: ["warmup"] }}
        skipped={{}}
        onCompleteTask={vi.fn()}
        onSkipTask={vi.fn()}
        onOverride={vi.fn()}
      />
    );
    expect(screen.getByText("Preparation")).toBeDefined();
    expect(screen.getByText("Throwing")).toBeDefined();
    // One stage finished, one not — and the sidebar agrees.
    expect(screen.getByLabelText("1 of 1 tasks resolved")).toBeDefined();
    expect(screen.getByLabelText("0 of 1 tasks resolved")).toBeDefined();
    expect(screen.getByText("1 of 2 resolved")).toBeDefined();
  });
});

describe("DailyPlan — skipping", () => {
  function renderPlan(overrides: Partial<DailyPlanProps> = {}) {
    const props: DailyPlanProps = {
      date: WEDNESDAY,
      plan: unlocked,
      tasks: TASKS,
      completed: {},
      skipped: {},
      onCompleteTask: vi.fn(),
      onSkipTask: vi.fn(),
      onOverride: vi.fn(),
      ...overrides,
    };
    render(<DailyPlan {...props} />);
    return props;
  }

  it("will not skip without a recorded reason", () => {
    const props = renderPlan();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip task" }));
    expect(props.onSkipTask).not.toHaveBeenCalled();
  });

  it("records the reason and the note with the skip", () => {
    const props = renderPlan();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Time constraint" } });
    fireEvent.change(screen.getByLabelText("Optional note"), { target: { value: "short on time" } });
    fireEvent.click(screen.getByRole("button", { name: "Skip task" }));

    expect(props.onSkipTask).toHaveBeenCalled();
    const [, next] = vi.mocked(props.onSkipTask).mock.calls[0];
    expect(next.warmup.reason).toBe("Time constraint");
    expect(next.warmup.notes).toBe("short on time");
  });

  it("shows a skipped task as skipped, not as done, and offers an undo", () => {
    const props = renderPlan({
      skipped: { [WEDNESDAY]: { warmup: { reason: "Time constraint", skippedAt: "2026-08-05T09:00:00.000Z" } } },
    });
    expect(screen.getByText("Skipped")).toBeDefined();
    expect((screen.getByRole("checkbox", { name: "Skipped Warm-up" }) as HTMLInputElement).checked).toBe(false);
    // Resolved for check-out, but never counted as completed work.
    expect(screen.getByText("1 of 1 resolved · 1 skipped")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Undo skip" }));
    expect(props.onSkipTask).toHaveBeenCalledWith(WEDNESDAY, {});
  });

  it("refuses to skip a health-hold action", () => {
    const props = renderPlan({
      plan: held,
      tasks: [task({ id: "hold", stageTitle: "Health Hold", name: "Book a review" })],
    });
    // The stylesheet's Skip control is not even offered for a hold action.
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    expect(props.onSkipTask).not.toHaveBeenCalled();
  });

  it("opens the detail panel for a task", () => {
    renderPlan();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Warm-up");
    expect(dialog.textContent).toContain("Why it is here");
    expect(dialog.textContent).toContain("Stop rule");
  });

  it("keeps check-out locked until every task is resolved", () => {
    renderPlan({ tasks: [task(), task({ id: "throw", name: "Catch play" })] });
    expect(screen.getByText(/check-out locked/i)).toBeDefined();
  });

  it("opens check-out once everything is resolved, however it was resolved", () => {
    renderPlan({
      tasks: [task(), task({ id: "throw", name: "Catch play" })],
      completed: { [WEDNESDAY]: ["warmup"] },
      skipped: { [WEDNESDAY]: { throw: { reason: "Time constraint", skippedAt: "2026-08-05T09:00:00.000Z" } } },
    });
    expect(screen.getByText(/Plan resolved/)).toBeDefined();
    expect(screen.getByText(/1 task was skipped/)).toBeDefined();
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
        skipped={{}}
        onCompleteTask={vi.fn()}
        onSkipTask={vi.fn()}
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
        skipped={{}}
        onCompleteTask={vi.fn()}
        onSkipTask={vi.fn()}
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
        skipped={{}}
        onCompleteTask={vi.fn()}
        onSkipTask={vi.fn()}
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


describe("DayTabs — the week's days", () => {
  const pre = { "2026-08-05": {} };
  const post = { "2026-08-04": {} };

  it("marks a checked-out day done, a checked-in day open, the rest locked", () => {
    expect(dayStatus("2026-08-04", pre, post)).toBe("done");
    expect(dayStatus("2026-08-05", pre, post)).toBe("open");
    expect(dayStatus("2026-08-06", pre, post)).toBe("locked");
  });

  it("prefers done over open when a day has both", () => {
    expect(dayStatus("2026-08-04", { "2026-08-04": {} }, post)).toBe("done");
  });

  it("renders seven tabs and reports the chosen day upward", () => {
    const onSelectDay = vi.fn();
    const tabs = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(
      (name, day) => ({
        day,
        date: `2026-08-0${3 + day}`,
        name,
        status: "locked" as const,
      })
    );
    render(<DayTabs tabs={tabs} selectedDay={0} today="2026-08-03" onSelectDay={onSelectDay} />);

    expect(screen.getAllByRole("button")).toHaveLength(7);
    fireEvent.click(screen.getByRole("button", { name: /Thursday/ }));
    expect(onSelectDay).toHaveBeenCalledWith(3);
  });

  it("says which tab is today, so another day cannot be mistaken for it", () => {
    const tabs = [
      { day: 0, date: "2026-08-03", name: "Monday", status: "locked" as const },
      { day: 1, date: "2026-08-04", name: "Tuesday", status: "locked" as const },
    ];
    render(<DayTabs tabs={tabs} selectedDay={1} today="2026-08-03" onSelectDay={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Monday.*today/ })).toBeDefined();
    expect(screen.queryByRole("button", { name: /Tuesday.*today/ })).toBeNull();
  });
});

describe("DailyPlan — looking at a day that is not today", () => {
  const tabs = [
    { day: 0, date: "2026-08-03", name: "Monday", status: "locked" as const },
    { day: 1, date: WEDNESDAY, name: "Tuesday", status: "locked" as const },
  ];

  it("says so plainly, and offers a way back", () => {
    const onToday = vi.fn();
    render(
      <DailyPlan
        date={WEDNESDAY}
        plan={unlocked}
        tasks={TASKS}
        completed={{}}
        skipped={{}}
        onCompleteTask={vi.fn()}
        onSkipTask={vi.fn()}
        onOverride={vi.fn()}
        dayTabs={tabs}
        selectedDay={1}
        today="2026-08-03"
        onSelectDay={vi.fn()}
        onToday={onToday}
      />
    );
    expect(screen.getByText(/Viewing .*, not today/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Back to today" }));
    expect(onToday).toHaveBeenCalled();
  });

  it("stays quiet when the selected day is today", () => {
    render(
      <DailyPlan
        date={WEDNESDAY}
        plan={unlocked}
        tasks={TASKS}
        completed={{}}
        skipped={{}}
        onCompleteTask={vi.fn()}
        onSkipTask={vi.fn()}
        onOverride={vi.fn()}
        dayTabs={tabs}
        selectedDay={1}
        today={WEDNESDAY}
        onSelectDay={vi.fn()}
        onToday={vi.fn()}
      />
    );
    expect(screen.queryByText(/Viewing .*, not today/)).toBeNull();
  });

  it("shows the tabs on the locked gate too, so the day can be changed there", () => {
    render(
      <DailyPlan
        date={WEDNESDAY}
        plan={locked}
        tasks={TASKS}
        completed={{}}
        skipped={{}}
        onCompleteTask={vi.fn()}
        onSkipTask={vi.fn()}
        onOverride={vi.fn()}
        dayTabs={tabs}
        selectedDay={1}
        today={WEDNESDAY}
        onSelectDay={vi.fn()}
      />
    );
    expect(screen.getByText(/Health check-in required/)).toBeDefined();
    expect(document.querySelectorAll(".day-tab")).toHaveLength(2);
  });
});
