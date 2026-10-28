import { PromotionRewardType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { parsePromotionForm } from "./form-input";

function form(fields: Record<string, string>, branchIds: string[] = []) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  for (const branchId of branchIds) data.append("branchIds", branchId);
  return data;
}

describe("promotion form input", () => {
  it("converts dollars to exact integer cents and keeps selected branches", () => {
    expect(
      parsePromotionForm(
        form(
          {
            name: "Lunch",
            scope: "selected",
            rewardType: PromotionRewardType.SPEND_THRESHOLD,
            discount: "7.25",
            minimum: "30.50"
          },
          ["branch-a"]
        )
      )
    ).toMatchObject({
      discountCents: 725,
      minimumSpendCents: 3050,
      appliesToAllBranches: false,
      branchIds: ["branch-a"]
    });
  });

  it("rejects malformed money, unsupported rewards and invalid dates", () => {
    expect(() =>
      parsePromotionForm(form({ rewardType: PromotionRewardType.FIXED_AMOUNT, discount: "1.234" }))
    ).toThrow("Discount");
    expect(() => parsePromotionForm(form({ rewardType: "FREE_ITEM" }))).toThrow("supported reward");
    expect(() =>
      parsePromotionForm(
        form({ rewardType: PromotionRewardType.PERCENTAGE, percent: "50", validFrom: "tomorrow" })
      )
    ).toThrow("UTC");
  });
});
