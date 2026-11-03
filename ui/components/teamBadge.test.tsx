import { describe, expect, it } from "vitest";
import { teamInitials } from "./Shell";

describe("team badge initials", () => {
  it("gives every club a badge, logo or not", () => {
    expect(teamInitials("Redlands Rays")).toBe("RR");
    expect(teamInitials("Brisbane Bandits")).toBe("BB");
    expect(teamInitials("Norths")).toBe("N");
    expect(teamInitials("The Hills Hornets")).toBe("HH");
    expect(teamInitials("")).toBe("?");
  });
});
