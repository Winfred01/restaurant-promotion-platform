import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PromotionReport } from "@/server/analytics/dashboard-summary";
import { BranchAnalytics } from "./branch-analytics";

const promotion: PromotionReport["promotions"][number] = {
  promotionId: "lunch",
  promotionName: "Weekday lunch",
  promotionStatus: "ACTIVE",
  claimCount: 4,
  redemptionCount: 2,
  redemptionRateBasisPoints: 5000,
  grossBillCents: 5000,
  totalDiscountCents: 700,
  netBillCents: 4300,
  averageBillCents: 2500,
  redemptionsWithBillAmounts: 2,
  uniqueCustomers: 2
};
function render(promotions: PromotionReport["promotions"]) {
  return renderToStaticMarkup(
    <BranchAnalytics
      report={{
        terminology: "Promotion-linked sales",
        scope: { organizationId: "org", branchId: "branch" },
        promotions
      }}
      currency="CAD"
      basePath="/app/org/branch"
    />
  );
}

describe("branch analytics presentation", () => {
  it("reconciles displayed gross, discount and net and sorts the rows by net sales", () => {
    const html = render([
      {
        ...promotion,
        promotionId: "dinner",
        promotionName: "Dinner",
        netBillCents: 900,
        grossBillCents: 1000,
        totalDiscountCents: 100
      },
      promotion
    ]);
    expect(html).toContain("$60.00");
    expect(html).toContain("−$8.00");
    expect(html).toContain("$52.00");
    expect(html.indexOf('class="analytics-promotion-name">Weekday lunch')).toBeLessThan(
      html.indexOf('class="analytics-promotion-name">Dinner')
    );
    expect(html).toContain("50.00% redemption rate");
    expect(html).toContain("/app/org/branch/manager/redemptions");
    expect(html).not.toMatch(/NaN|Infinity/);
  });
  it("keeps zero sales and missing averages/rates distinct without painting a sales stub", () => {
    const html = render([
      {
        ...promotion,
        claimCount: 0,
        redemptionCount: 0,
        redemptionRateBasisPoints: null,
        grossBillCents: 0,
        netBillCents: 0,
        totalDiscountCents: 0,
        redemptionsWithBillAmounts: 0,
        averageBillCents: null,
        uniqueCustomers: 0
      }
    ]);
    expect(html).toContain("$0.00");
    expect(html).toContain("Rate unavailable");
    expect(html).toContain('class="analytics-missing">—');
    expect(html).toContain("width:0%");
    expect(html).not.toMatch(/NaN|Infinity/);
  });
  it("preserves an actionable first-run state and keeps acquisition organization-wide", () => {
    const html = render([]);
    expect(html).toContain("No promotions yet");
    expect(html).toContain("Create a promotion");
    expect(html).toContain("organization-wide and available to Owners");
    expect(html).toContain("Voided redemptions excluded");
  });
});
