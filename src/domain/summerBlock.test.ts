/**
 * The nineteen weeks that were opting out.
 *
 * `GYM_STAGE_TITLES` listed "Whole-Body Force" and "Whole-Body Power" and not
 * "Whole-Body Gym", which is the summer competition block's only gym stage. So
 * across weeks 12–22 and 29–36 the overlay found no gym stage, returned early,
 * and none of the testing-driven programming existed: no reactive work, and the
 * broad jump the report asked to replace survived in every one of them.
 *
 * Nothing failed. The sessions built, the tests passed, and a third of the year
 * quietly ran the pre-testing programme. So the tests here are mostly about
 * coverage rather than about any single prescription: does every week of the
 * year that has a gym stage actually get looked at, and is the movement the
 * report named absent from all fifty-two.
 */

import { describe, expect, it } from "vitest";
import { buildSession, weekPlan } from "./programmeSessions";
import { applyBaselineProgramming } from "./programmeUpdates";
import { velocityPolicy } from "./velocity";

const WEEKS = Array.from({ length: 52 }, (_, index) => index + 1);
const DAYS = [0, 1, 2, 3, 4, 5, 6];
const GYM_STAGES = ["Whole-Body Force", "Whole-Body Power", "Whole-Body Gym"];

const SUMMER = WEEKS.filter((week) => velocityPolicy(week).block === "two_game");

function tasksFor(week: number, day: number) {
  return applyBaselineProgramming(buildSession(weekPlan(week), day), null, day).tasks;
}

/** Every task the programme can show, all year. */
function everyTask() {
  return WEEKS.flatMap((week) => DAYS.flatMap((day) => tasksFor(week, day)));
}

describe("the movement the report asked to replace", () => {
  it("is gone from the whole year, not just from Monday", () => {
    const survivors = everyTask().filter((task) =>
      /broad jump/i.test(`${task.name} ${task.prescription}`)
    );
    expect(survivors.map((task) => `${task.id}: ${task.name}`)).toEqual([]);
  });

  it("leaves the movements it was paired with intact", () => {
    // Removing half a compound task must not take the other half with it.
    const wednesday = tasksFor(7, 2);
    const jump = wednesday.find((task) => /trap bar jump/i.test(task.name));
    expect(jump?.name).toBe("Trap bar jump");
    expect(jump?.prescription).toBe("3 × 3 @ 30 kg");

    const summer = tasksFor(SUMMER[0], 2);
    expect(summer.some((task) => /shot put/i.test(task.name))).toBe(true);
  });

  it("never leaves a task with a name but no prescription", () => {
    for (const task of everyTask()) {
      expect(String(task.name).trim(), String(task.id)).not.toBe("");
      expect(String(task.prescription).trim(), String(task.id)).not.toBe("");
    }
  });

  it("does not repeat the task's own name inside its prescription", () => {
    for (const task of everyTask()) {
      expect(
        String(task.prescription).toLowerCase().startsWith(String(task.name).toLowerCase()),
        `${task.id}: "${task.name}" — "${task.prescription}"`
      ).toBe(false);
    }
  });
});

describe("every gym stage in the year gets looked at", () => {
  it("adds reactive work to each week that has a gym day", () => {
    for (const week of WEEKS) {
      const hasGym = DAYS.some((day) =>
        tasksFor(week, day).some((task) => GYM_STAGES.includes(task.stageTitle))
      );
      if (!hasGym) continue;
      const hasDepthJump = DAYS.some((day) =>
        tasksFor(week, day).some((task) => /depth jump/i.test(task.name))
      );
      expect(hasDepthJump, `week ${week} has a gym day and no depth jump`).toBe(true);
    }
  });

  it("never prescribes two depth jumps in one session", () => {
    for (const week of WEEKS) {
      for (const day of DAYS) {
        const jumps = tasksFor(week, day).filter((task) => /depth jump/i.test(task.name));
        expect(jumps.length, `week ${week} day ${day}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("puts the reactive work after whatever opens the gym, not before it", () => {
    // Stepping off a box as the first thing in the session is the one order
    // this must not produce.
    for (const week of WEEKS) {
      for (const day of DAYS) {
        const tasks = tasksFor(week, day);
        const jump = tasks.findIndex((task) => /depth jump/i.test(task.name));
        if (jump === -1) continue;
        const opener = tasks.findIndex(
          (task) =>
            GYM_STAGES.includes(task.stageTitle) && /primer|med-ball|shot put/i.test(task.name)
        );
        if (opener === -1) continue;
        expect(opener, `week ${week} day ${day}`).toBeLessThan(jump);
      }
    }
  });
});

/**
 * The stage a task claims and the stage it is placed in have to agree.
 *
 * The plan groups by the stage *number*, so a task spliced into stage 3 while
 * carrying `stage: 4` does not join that stage — it renders as an extra stage
 * of its own, one item long, below the session it belongs to. Every builder in
 * the overlay hardcoded 4, which was right on Monday and Wednesday by
 * coincidence and wrong on the summer block, whose gym is stage 3.
 */
describe("added tasks join the stage they are placed in", () => {
  it("never gives a task a stage number its neighbours do not share", () => {
    for (const week of WEEKS) {
      for (const day of DAYS) {
        const tasks = tasksFor(week, day);
        // A stage's tasks must be contiguous: seeing a stage number again after
        // leaving it means something was inserted with the wrong one.
        const order: unknown[] = [];
        for (const task of tasks) {
          if (order[order.length - 1] !== task.stage) order.push(task.stage);
        }
        expect(new Set(order).size, `week ${week} day ${day}: stages ${order.join(" ")}`).toBe(
          order.length
        );
      }
    }
  });

  it("never leaves an addition alone in a stage of its own", () => {
    // The overlay's own tasks, by the id suffix each builder gives them.
    const ADDED = /-(depth-jump|velocity-squat|back-squat|rdl|soleus)$/;
    for (const week of WEEKS) {
      for (const day of DAYS) {
        const tasks = tasksFor(week, day);
        for (const added of tasks.filter((task) => ADDED.test(String(task.id)))) {
          const company = tasks.filter(
            (task) =>
              task.id !== added.id &&
              task.stage === added.stage &&
              task.stageTitle === added.stageTitle
          );
          expect(
            company.length,
            `week ${week} day ${day}: ${added.id} is alone in stage ${added.stage} "${added.stageTitle}"`
          ).toBeGreaterThan(0);
        }
      }
    }
  });

  it("puts the summer depth jump in the gym stage, not beside it", () => {
    const tasks = tasksFor(SUMMER[0], 2);
    const jump = tasks.find((task) => /depth jump/i.test(task.name))!;
    const gym = tasks.find((task) => task.name === "Trap bar deadlift")!;
    expect(jump.stage).toBe(gym.stage);
    expect(jump.stageTitle).toBe(gym.stageTitle);
  });
});

describe("a week with two games in it", () => {
  it("exists, and is the GBL blocks", () => {
    expect(SUMMER).toContain(15);
    expect(SUMMER).toContain(30);
    expect(SUMMER.length).toBeGreaterThan(15);
  });

  it("takes the reactive work at two sets, not three", () => {
    for (const week of SUMMER) {
      const jump = DAYS.flatMap((day) => tasksFor(week, day)).find((task) =>
        /depth jump/i.test(task.name)
      );
      expect(jump?.prescription, `week ${week}`).toMatch(/^2 × 3/);
    }
    // The winter Monday keeps its full dose.
    const winter = tasksFor(7, 0).find((task) => /depth jump/i.test(task.name));
    expect(winter?.prescription).toMatch(/^3 × 3/);
  });

  it("does not stack a fourth lower-body lift in front of a game", () => {
    // The swap is a swap. With the trap bar and the split squat already on the
    // day, adding the speed squat and the back squat is the same error that
    // took the trap bar off Monday.
    for (const week of SUMMER) {
      for (const day of DAYS) {
        const names = tasksFor(week, day).map((task) => String(task.name));
        expect(names, `week ${week} day ${day}`).not.toContain("Back squat");
        expect(names.some((name) => /Speed squat/.test(name)), `week ${week} day ${day}`).toBe(
          false
        );
      }
    }
  });

  it("still gets the hinge and the calf microdose it always had", () => {
    const thursday = tasksFor(SUMMER[0], 3).map((task) => String(task.name));
    expect(thursday.some((name) => /Romanian deadlift/.test(name))).toBe(true);
    expect(thursday.some((name) => /calf raise/i.test(name))).toBe(true);
  });
});

describe("the summer block's primary lift", () => {
  it("says how many reps to do", () => {
    // It was prescribed "Wednesday full body 2–3 sets @ RPE 6" — the summary
    // for the whole session, handed to one exercise, with no rep count on it.
    for (const week of SUMMER) {
      const trap = DAYS.flatMap((day) => tasksFor(week, day)).find(
        (task) => task.name === "Trap bar deadlift"
      );
      expect(trap, `week ${week} has no trap bar`).toBeTruthy();
      expect(trap!.prescription, `week ${week}`).toMatch(/^\d+ × \d+ @ RPE/);
    }
  });

  it("periodises, rather than repeating one week all block", () => {
    const doses = SUMMER.map(
      (week) =>
        DAYS.flatMap((day) => tasksFor(week, day)).find(
          (task) => task.name === "Trap bar deadlift"
        )?.prescription
    );
    expect(new Set(doses).size).toBeGreaterThan(1);
  });

  it("keeps the programme's own effort cap rather than converting it", () => {
    const trap = tasksFor(15, 2).find((task) => task.name === "Trap bar deadlift");
    expect(trap?.prescription).toBe("3 × 3 @ RPE 6");
    expect(String(trap?.evidence)).toMatch(/no rep count/);
  });

  it("leaves a prescription that already has sets and reps alone", () => {
    // Winter's trap bar carries real numbers from the week plan; nothing here
    // should touch it. It survives on Wednesday as the jump variant.
    const wednesday = tasksFor(7, 2).find((task) => /trap bar jump/i.test(task.name));
    expect(wednesday?.prescription).toBe("3 × 3 @ 30 kg");
  });
});
