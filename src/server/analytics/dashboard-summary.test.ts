import { describe, expect, it } from "vitest";

import {
  summarizeAcquisitionDashboard,
  summarizePromotionDashboard,
  type AcquisitionReport,
  type PromotionReport
} from "./dashboard-summary";

describe("dashboard summaries", () => {
  it("sums completed promotion results across active and historical offers", () => {
    const report = {
      promotions: [
        {
          promotionStatus: "ACTIVE",
          redemptionCount: 2,
          netBillCents: 4300,
          totalDiscountCents: 700
        },
        {
          promotionStatus: "ARCHIVED",
          redemptionCount: 1,
          netBillCents: 1500,
          totalDiscountCents: 500
        }
      ]
    } as PromotionReport;

    expect(summarizePromotionDashboard(report)).toEqual({
      activePromotions: 1,
      completedRedemptions: 3,
      promotionLinkedSalesCents: 5800,
      discountCents: 1200
    });
  });

  it("shows the three largest original channels without inventing branch attribution", () => {
    const report = {
      channels: [
        {
          acquisitionChannelId: "zero",
          acquisitionChannelName: "Unused",
          newCustomers: 0,
          observedReturningCustomers: 0
        },
        {
          acquisitionChannelId: "b",
          acquisitionChannelName: "WeChat",
          newCustomers: 4,
          observedReturningCustomers: 1
        },
        {
          acquisitionChannelId: "a",
          acquisitionChannelName: "Instagram",
          newCustomers: 7,
          observedReturningCustomers: 2
        },
        {
          acquisitionChannelId: "c",
          acquisitionChannelName: "Referral",
          newCustomers: 3,
          observedReturningCustomers: 1
        },
        {
          acquisitionChannelId: "d",
          acquisitionChannelName: "Walk-in",
          newCustomers: 2,
          observedReturningCustomers: 0
        }
      ]
    } as AcquisitionReport;

    const summary = summarizeAcquisitionDashboard(report);
    expect(summary.newCustomers).toBe(16);
    expect(summary.observedReturningCustomers).toBe(4);
    expect(summary.topChannels.map(({ acquisitionChannelName }) => acquisitionChannelName)).toEqual(
      ["Instagram", "WeChat", "Referral"]
    );
  });
});
