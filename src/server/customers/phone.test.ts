import { describe, expect, it } from "vitest";

import { InvalidPhoneNumberError, normalizePhoneNumber } from "./phone";

describe("normalizePhoneNumber", () => {
  it.each([
    ["(416) 555-0123", "+14165550123"],
    ["416-555-0123", "+14165550123"],
    ["1 416 555 0123", "+14165550123"],
    ["+1 (416) 555-0123", "+14165550123"],
    ["0044 20 7946 0958", "+442079460958"]
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizePhoneNumber(input)).toBe(expected);
  });

  it.each(["", "555-0123", "+0123456789", "+1+4165550123", "416-FLOWERS"])(
    "rejects invalid input without echoing it",
    (input) => {
      expect(() => normalizePhoneNumber(input)).toThrow(InvalidPhoneNumberError);

      try {
        normalizePhoneNumber(input);
      } catch (error) {
        if (input) {
          expect((error as Error).message).not.toContain(input);
        }
      }
    }
  );
});
