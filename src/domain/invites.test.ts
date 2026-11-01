import { describe, expect, it } from "vitest";
import { INVITE_LENGTH, inviteLink, newInviteCode, normalizeInviteCode } from "./invites";

describe("invite codes", () => {
  it("makes codes of the right length from the readable alphabet", () => {
    for (let i = 0; i < 50; i += 1) {
      const code = newInviteCode();
      expect(code).toHaveLength(INVITE_LENGTH);
      expect(code).toMatch(/^[2-9A-HJKMNP-Z]+$/);
      expect(normalizeInviteCode(code)).toBe(code);
    }
  });

  it("accepts a code typed in lower case or with spaces and dashes", () => {
    expect(normalizeInviteCode("abcd-efgh 23")).toBe("ABCDEFGH23");
  });

  it("refuses anything that is not a code", () => {
    expect(normalizeInviteCode("")).toBeNull();
    expect(normalizeInviteCode("ABCDEFGH2")).toBeNull();
    expect(normalizeInviteCode("ABCDEFGH20")).toBeNull(); // 0 is not in the alphabet
    expect(normalizeInviteCode("'; DROP TABLE")).toBeNull();
  });

  it("builds the join link", () => {
    expect(inviteLink("https://example.com/", "ABCDEFGH23")).toBe("https://example.com/next/?invite=ABCDEFGH23");
  });
});
