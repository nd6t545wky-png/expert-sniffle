/**
 * The two things you do standing at a rack.
 *
 * Read what you lifted last time and decide what to load, or write the section
 * off because the gym closed. The domain tests prove the verdicts and the skip
 * rules; these prove the athlete can reach both without reading a paragraph —
 * and that the recommendation actually lands in the logger, which is the
 * difference between advice being followed and advice being retyped.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { DailyPlan } from "./DailyPlan";
import { PlanState } from "../../src/domain/session";
import { Advice } from "../../src/domain/progression";

const DATE = "2026-08-24" as never;
const unlocked: PlanState = { status: "unlocked", planLevel: "full", workloadFactor: 1 };

afterEach(cleanup);

const task = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "w7-d0-bench",
  stage: 4,
  stageTitle: "Whole-Body Force",
  stageDescription: "Lift.",
  name: "Bench press",
  prescription: "3 × 5 @ RPE 7 · suggested start 50–52.5 kg",
  cue: "Brace.",
  ...over,
});

const advice = (over: Partial<Advice> = {}): Advice => ({
  verdict: "increase",
  headline: "Go up to 62.5 kg.",
  reason: "7 days ago you completed 5×60 · 5×60 · 5×60 — every set at 5 reps or better.",
  suggestedKg: 62.5,
  last: { date: "2026-08-17" as never, sets: [{ reps: 5, kg: 60 }, { reps: 5, kg: 60 }, { reps: 5, kg: 60 }] },
  ...over,
});

function plan(props: Record<string, unknown> = {}) {
  const onSkipTask = vi.fn();
  const onLogSets = vi.fn();
  render(
    <DailyPlan
      date={DATE}
      plan={unlocked}
      tasks={[task()] as never}
      completed={{}}
      skipped={{}}
      onCompleteTask={vi.fn()}
      onSkipTask={onSkipTask}
      onOverride={vi.fn()}
      onLogSets={onLogSets}
      progression={{ "w7-d0-bench": advice() }}
      {...props}
    />
  );
  return { onSkipTask, onLogSets };
}

describe("what you lifted last time", () => {
  it("shows the previous session's sets against the lift", () => {
    plan();
    expect(screen.getByText(/5×60 · 5×60 · 5×60/)).toBeTruthy();
    expect(screen.getByText(/Mon, 17 Aug/)).toBeTruthy();
  });

  it("leads with the verdict, not the history", () => {
    plan();
    expect(screen.getByText("Go up to 62.5 kg.")).toBeTruthy();
    expect(screen.getByText("Go up")).toBeTruthy();
  });

  it("keeps the reasoning one tap away rather than on the face of it", () => {
    plan();
    expect(screen.queryByText(/every set at 5 reps or better/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Why?" }));
    expect(screen.getByText(/every set at 5 reps or better/)).toBeTruthy();
  });

  it("opens the logger on the recommended load, not the prescribed one", () => {
    // The whole point: taking the advice must not mean retyping it.
    plan();
    fireEvent.click(screen.getByRole("button", { name: "Log sets" }));
    const inputs = document.querySelectorAll<HTMLInputElement>(".setlog-row input[type=number]");
    // Three rows, each reps-then-kg.
    expect(inputs).toHaveLength(6);
    expect(inputs[0].value).toBe("5");
    expect(inputs[1].value).toBe("62.5");
  });

  it("opens on what was already logged, once there is a log", () => {
    plan({ setLog: { "w7-d0-bench": [{ reps: 5, kg: 57.5 }] } });
    fireEvent.click(screen.getByRole("button", { name: "Edit sets" }));
    const inputs = document.querySelectorAll<HTMLInputElement>(".setlog-row input[type=number]");
    expect(inputs[1].value).toBe("57.5");
  });

  it("says so on a lift with no history yet", () => {
    plan({
      progression: {
        "w7-d0-bench": advice({
          verdict: "first_time",
          headline: "First logged session — pick a load and log it.",
          reason: "Nothing logged for this lift yet.",
          suggestedKg: undefined,
          last: undefined,
        }),
      },
    });
    expect(screen.getByText(/First logged session/)).toBeTruthy();
    expect(screen.queryByText(/Last time/)).toBeNull();
  });

  it("does not nag once the task is ticked off", () => {
    plan({ completed: { [DATE]: ["w7-d0-bench"] } });
    expect(screen.queryByText("Go up to 62.5 kg.")).toBeNull();
  });

  it("marks the verdict on the row so colour is not the only signal", () => {
    const { container } = render(
      <DailyPlan
        date={DATE}
        plan={unlocked}
        tasks={[task()] as never}
        completed={{}}
        skipped={{}}
        onCompleteTask={vi.fn()}
        onSkipTask={vi.fn()}
        onOverride={vi.fn()}
        progression={{ "w7-d0-bench": advice({ verdict: "back_off" }) }}
      />
    );
    expect(container.querySelector(".last-time.verdict-back_off")).toBeTruthy();
  });
});

describe("skipping a whole section", () => {
  const gym = [
    task({ id: "w7-d0-squat", name: "Back squat" }),
    task({ id: "w7-d0-bench", name: "Bench press" }),
    task({ id: "w7-d0-row", name: "Row" }),
  ];

  it("offers one control for the section, not one per task", () => {
    plan({ tasks: gym as never, progression: {} });
    expect(screen.getByRole("button", { name: /Skip all 3 remaining/ })).toBeTruthy();
  });

  it("asks once, then skips all of them with the same reason", () => {
    const { onSkipTask } = plan({ tasks: gym as never, progression: {} });
    fireEvent.click(screen.getByRole("button", { name: /Skip all 3 remaining/ }));

    expect(screen.getByText(/Skip the rest of Whole-Body Force\?/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Time constraint" } });
    fireEvent.click(screen.getByRole("button", { name: "Skip 3 tasks" }));

    expect(onSkipTask).toHaveBeenCalledTimes(1);
    const [, next] = onSkipTask.mock.calls[0];
    expect(Object.keys(next).sort()).toEqual(["w7-d0-bench", "w7-d0-row", "w7-d0-squat"]);
    expect(Object.values(next).every((entry) => (entry as { reason: string }).reason === "Time constraint")).toBe(true);
  });

  it("counts only what is left, and leaves completed work alone", () => {
    const { onSkipTask } = plan({
      tasks: gym as never,
      progression: {},
      completed: { [DATE]: ["w7-d0-squat"] },
    });
    expect(screen.getByRole("button", { name: /Skip all 2 remaining/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Skip all 2 remaining/ }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Time constraint" } });
    fireEvent.click(screen.getByRole("button", { name: "Skip 2 tasks" }));
    const [, next] = onSkipTask.mock.calls[0];
    expect(Object.keys(next)).not.toContain("w7-d0-squat");
  });

  it("will not offer to skip a health hold", () => {
    plan({
      tasks: [
        task({ id: "a", stageTitle: "Health Hold", name: "Review with clinician" }),
        task({ id: "b", stageTitle: "Health Hold", name: "Call physio" }),
      ] as never,
      progression: {},
    });
    expect(screen.queryByRole("button", { name: /Skip all/ })).toBeNull();
  });

  it("does not offer a bulk skip for a single task", () => {
    // One task already has its own Skip button; a second control for the same
    // action is noise.
    plan({ progression: {} });
    expect(screen.queryByRole("button", { name: /Skip all/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Skip" })).toBeTruthy();
  });

  it("still refuses without a reason", () => {
    const { onSkipTask } = plan({ tasks: gym as never, progression: {} });
    fireEvent.click(screen.getByRole("button", { name: /Skip all 3 remaining/ }));
    const submit = screen.getByRole("button", { name: "Skip 3 tasks" });
    fireEvent.click(submit);
    expect(onSkipTask).not.toHaveBeenCalled();
  });

  it("disappears once the section is resolved", () => {
    plan({
      tasks: gym as never,
      progression: {},
      completed: { [DATE]: ["w7-d0-squat", "w7-d0-bench", "w7-d0-row"] },
    });
    expect(screen.queryByRole("button", { name: /Skip all/ })).toBeNull();
  });

  it("scopes the skip to its own section", () => {
    const { onSkipTask } = plan({
      tasks: [
        ...gym,
        task({ id: "w7-d0-cond", stage: 5, stageTitle: "Condition", name: "Easy aerobic" }),
      ] as never,
      progression: {},
    });
    const stages = document.querySelectorAll(".task-stage");
    const gymStage = stages[0] as HTMLElement;
    fireEvent.click(within(gymStage).getByRole("button", { name: /Skip all 3 remaining/ }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Time constraint" } });
    fireEvent.click(screen.getByRole("button", { name: "Skip 3 tasks" }));
    const [, next] = onSkipTask.mock.calls[0];
    expect(Object.keys(next)).not.toContain("w7-d0-cond");
  });
});
