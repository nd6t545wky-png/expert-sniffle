import { describe, expect, it } from "vitest";
import { programmeStartFor } from "./calendar";

describe("the programme year rolls over", () => {
  it("stays on the first year until its 52 weeks are done", () => {
    expect(programmeStartFor("2026-07-13")).toBe("2026-07-13");
    expect(programmeStartFor("2027-07-11")).toBe("2026-07-13");
    expect(programmeStartFor("2026-01-01")).toBe("2026-07-13");
  });
  it("starts the next year the Monday after week 52, and every year after", () => {
    expect(programmeStartFor("2027-07-12")).toBe("2027-07-12");
    expect(programmeStartFor("2028-07-10")).toBe("2028-07-10");
    expect(new Date(`${programmeStartFor("2030-03-03")}T00:00:00Z`).getUTCDay()).toBe(1);
  });
});
