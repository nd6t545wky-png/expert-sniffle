/**
 * The velocity block card.
 *
 * The domain tests prove the policy. These prove the athlete can see it — in
 * particular on the weeks where the answer is "not this week", which is the
 * case a capped session most needs explaining.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { VelocityBlock } from "./VelocityBlock";
import { velocityPolicy } from "../../src/domain/velocity";

afterEach(cleanup);

describe("the velocity block card", () => {
  it("names the block and the week within it", () => {
    render(<VelocityBlock week={3} />);
    expect(screen.getByText(/In season · week 3 of 8/)).toBeTruthy();
  });

  it("shows the ceiling as a number and marks it on the strip", () => {
    const { container } = render(<VelocityBlock week={3} />);
    // The head states it, and the strip repeats it on the marked segment.
    expect(container.querySelector(".card-head strong")?.textContent).toBe("70%");
    expect(container.querySelector(".velocity-band.ceiling")?.textContent).toContain("hybrid B");
    // Recovery and hybrid B reached; hybrid A and velocity not.
    expect(container.querySelectorAll(".velocity-band.reached")).toHaveLength(2);
    expect(container.querySelectorAll(".velocity-band.ceiling")).toHaveLength(1);
  });

  it("marks the velocity block itself differently from an in-season week", () => {
    const develop = [...Array(52).keys()]
      .map((index) => index + 1)
      .find((week) => velocityPolicy(week).block === "develop")!;
    const { container } = render(<VelocityBlock week={develop} />);
    expect(container.querySelector(".card-head p")?.textContent).toMatch(/^Velocity block/);
    expect(container.querySelector(".velocity-band.ceiling")?.textContent).toContain("hybrid A");
    expect(container.querySelectorAll(".velocity-band.reached")).toHaveLength(3);
  });

  it("says outright when a week carries no high-intent exposure", () => {
    render(<VelocityBlock week={30} />);
    expect(screen.getByText(/No high-intent throwing exposure this week/i)).toBeTruthy();
  });

  it("says when the exposure exists and which day it is on", () => {
    render(<VelocityBlock week={3} />);
    expect(screen.getByText(/One high-intent throwing exposure this week, on Wednesday/i)).toBeTruthy();
  });

  it("flags a block resting on an unpublished draw", () => {
    render(<VelocityBlock week={45} />);
    expect(screen.getByText(/provisional draw/i)).toBeTruthy();
  });

  it("carries the reasoning, not only the verdict", () => {
    render(<VelocityBlock week={3} />);
    expect(screen.getByText(velocityPolicy(3).note)).toBeTruthy();
  });

  it("labels the strip for a screen reader, which cannot see the fill", () => {
    render(<VelocityBlock week={3} />);
    expect(screen.getByLabelText(/Plyo ball intent ceiling: hybrid B, 70%/i)).toBeTruthy();
  });
});
