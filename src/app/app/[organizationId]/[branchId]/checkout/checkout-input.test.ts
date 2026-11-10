import { describe, expect, it } from "vitest";

import { isValidReceipt, money, parseSubtotalCents } from "./checkout-input";

describe("checkout money input", () => {
  it.each([
    ["12", 1200],
    ["12.3", 1230],
    ["12.34", 1234],
    ["21474836.47", 2_147_483_647]
  ])("converts %s to integer cents", (input, expected) => {
    expect(parseSubtotalCents(input)).toBe(expected);
  });

  it.each(["0", "0.00", "12.345", "-1", "1e3", "21474836.48", "abc"])(
    "rejects invalid subtotal %s",
    (input) => expect(parseSubtotalCents(input)).toBeNull()
  );

  it("formats integer cents for the receipt summary", () => {
    expect(money(1234)).toBe("$12.34");
  });
});

describe("receipt input", () => {
  it.each([" AB  42 ", "R-1.2_3/4", "收据-12"])("accepts %s", (value) => {
    expect(isValidReceipt(value)).toBe(true);
  });

  it.each(["", " -1", "a#b", "A\nB", "X".repeat(81)])("rejects %s", (value) => {
    expect(isValidReceipt(value)).toBe(false);
  });
});
