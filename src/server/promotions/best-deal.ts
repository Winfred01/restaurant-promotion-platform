import type { PromotionEligibilityResult } from "./eligibility";

export type PromotionBestDealResult = PromotionEligibilityResult & {
  isBestDeal: boolean;
};

/** Mark one eligible offer with the greatest immediate savings, without changing input order. */
export function markBestDeal(
  results: readonly PromotionEligibilityResult[]
): PromotionBestDealResult[] {
  let bestIndex = -1;

  for (const [index, result] of results.entries()) {
    if (!result.eligible) {
      continue;
    }

    const best = bestIndex === -1 ? null : results[bestIndex];
    if (
      !best ||
      result.discountCents > best.discountCents ||
      (result.discountCents === best.discountCents && result.promotionId < best.promotionId)
    ) {
      bestIndex = index;
    }
  }

  return results.map((result, index) => ({ ...result, isBestDeal: index === bestIndex }));
}
