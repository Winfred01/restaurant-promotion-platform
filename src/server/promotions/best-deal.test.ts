import { describe, expect, it } from "vitest";

import { markBestDeal } from "./best-deal";
import type { PromotionEligibilityResult } from "./eligibility";

function result(
  promotionId: string,
  discountCents: number,
  eligible = true
): PromotionEligibilityResult {
  return {
    promotionId,
    eligible,
    reasonCodes: [],
    discountCents,
    finalBillCents: 2_000 - discountCents
  };
}

describe("Best Deal selection", () => {
  it("marks the largest eligible savings without reordering or changing the input", () => {
    const input = [result("smaller", 200), result("largest", 500), result("middle", 300)];

    expect(markBestDeal(input)).toEqual([
      { ...input[0], isBestDeal: false },
      { ...input[1], isBestDeal: true },
      { ...input[2], isBestDeal: false }
    ]);
    expect(input).toEqual([result("smaller", 200), result("largest", 500), result("middle", 300)]);
  });

  it("breaks equal-savings ties by promotion ID regardless of candidate order", () => {
    const firstOrder = [result("z-offer", 500), result("a-offer", 500)];
    const reverseOrder = [...firstOrder].reverse();

    expect(markBestDeal(firstOrder).filter(({ isBestDeal }) => isBestDeal)).toEqual([
      { ...firstOrder[1], isBestDeal: true }
    ]);
    expect(markBestDeal(reverseOrder).filter(({ isBestDeal }) => isBestDeal)).toEqual([
      { ...reverseOrder[0], isBestDeal: true }
    ]);
  });

  it("excludes ineligible offers even if they report larger savings", () => {
    expect(markBestDeal([result("blocked", 900, false), result("available", 100)])).toEqual([
      { ...result("blocked", 900, false), isBestDeal: false },
      { ...result("available", 100), isBestDeal: true }
    ]);
    expect(markBestDeal([result("blocked", 900, false)])).toEqual([
      { ...result("blocked", 900, false), isBestDeal: false }
    ]);
  });

  it("handles no offers and an eligible zero-savings offer", () => {
    expect(markBestDeal([])).toEqual([]);
    expect(markBestDeal([result("zero", 0)])).toEqual([{ ...result("zero", 0), isBestDeal: true }]);
  });
});
