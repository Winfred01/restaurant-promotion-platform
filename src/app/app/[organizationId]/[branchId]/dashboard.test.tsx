import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AcquisitionReport, PromotionReport } from "@/server/analytics/dashboard-summary";

import { Dashboard } from "./dashboard";

const promotions: PromotionReport = {
  terminology: "Promotion-linked sales",
  scope: { organizationId: "restaurant-a", branchId: null },
  promotions: [
    {
      promotionId: "small",
      promotionName: "Small offer",
      promotionStatus: "PAUSED",
      claimCount: 0,
      redemptionCount: 0,
      redemptionRateBasisPoints: null,
      grossBillCents: 0,
      totalDiscountCents: 0,
      netBillCents: 0,
      averageBillCents: null,
      redemptionsWithBillAmounts: 0,
      uniqueCustomers: 0
    },
    {
      promotionId: "lunch",
      promotionName: "Lunch offer",
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
    }
  ]
};

const acquisition: AcquisitionReport = {
  scope: { organizationId: "restaurant-a" },
  methodology: {
    returnDefinition: "At least two completed redemptions with recorded bill amounts",
    spendDefinition: "Net bill amount from completed promotion-linked redemptions only"
  },
  channels: [
    {
      acquisitionChannelId: "referral",
      acquisitionChannelName: "Referral",
      acquisitionChannelStatus: "ACTIVE",
      newCustomers: 3,
      observedReturningCustomers: 1,
      observedReturnRateBasisPoints: 3333,
      recordedSpendCents: 6900,
      averageRecordedSpendPerCustomerCents: 2300
    },
    {
      acquisitionChannelId: "walk-in",
      acquisitionChannelName: "Walk-in",
      acquisitionChannelStatus: "ACTIVE",
      newCustomers: 1,
      observedReturningCustomers: 0,
      observedReturnRateBasisPoints: 0,
      recordedSpendCents: 0,
      averageRecordedSpendPerCustomerCents: 0
    }
  ]
};

describe("organization analytics display", () => {
  it("reconciles promotion sales and keeps original-channel spend separate", () => {
    const html = renderToStaticMarkup(
      <Dashboard
        scope="organization"
        report={promotions}
        acquisition={acquisition}
        currency="CAD"
        basePath="/app/restaurant-a/branch-a"
      />
    );

    expect(html).toContain("$43.00");
    expect(html).toContain("$50.00");
    expect(html).toContain("$7.00");
    expect(html).toContain("50.00%");
    expect(html.indexOf("Lunch offer")).toBeLessThan(html.indexOf("Small offer"));
    expect(html).toContain("Referral");
    expect(html).toContain("33.33%");
    expect(html).toContain("$69.00");
    expect(html).toContain("$23.00");
    expect(html).toContain("not lifetime spend");
    expect(html).not.toMatch(/NaN|Infinity/);
  });
});
