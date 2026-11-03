/**
 * Invite codes: how a new player gets an account.
 *
 * Accounts are invite-only. The owner (the first account ever created - the
 * athlete this app was built for) makes a code per player and sends it as a
 * link. A code works once; the owner can revoke one that has not been used.
 *
 * Codes are ten characters from an alphabet with no look-alikes (no 0/O, 1/I/L),
 * so one read over the phone still works. Fifty bits of randomness: guessing
 * one is not a realistic way in, and the endpoint is rate-limited besides.
 */

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const INVITE_LENGTH = 10;

export function newInviteCode(random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  const bytes = random(new Uint8Array(INVITE_LENGTH));
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

/** A typed or pasted code, tidied: case, spaces and dashes do not matter. */
export function normalizeInviteCode(value: unknown): string | null {
  const cleaned = String(value ?? "")
    .toUpperCase()
    .replace(/[\s-]/g, "");
  return cleaned.length === INVITE_LENGTH && [...cleaned].every((char) => ALPHABET.includes(char)) ? cleaned : null;
}

/** The link a player opens to join. */
export function inviteLink(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/next/?invite=${code}`;
}
