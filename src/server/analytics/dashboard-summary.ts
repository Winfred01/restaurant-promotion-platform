import type { createAcquisitionAnalyticsService } from "./acquisition";
import type { createPromotionAnalyticsService } from "./promotion";

export type PromotionReport = Awaited<
  ReturnType<ReturnType<typeof createPromotionAnalyticsService>["report"]>
>;
export type AcquisitionReport = Awaited<
  ReturnType<ReturnType<typeof createAcquisitionAnalyticsService>["report"]>
>;

export function summarizePromotionDashboard(report: PromotionReport) {
  return report.promotions.reduce(
    (summary, promotion) => ({
      activePromotions: summary.activePromotions + Number(promotion.promotionStatus === "ACTIVE"),
      completedRedemptions: summary.completedRedemptions + promotion.redemptionCount,
      promotionLinkedSalesCents: summary.promotionLinkedSalesCents + promotion.netBillCents,
      discountCents: summary.discountCents + promotion.totalDiscountCents
    }),
    {
      activePromotions: 0,
      completedRedemptions: 0,
      promotionLinkedSalesCents: 0,
      discountCents: 0
    }
  );
}

export function summarizeAcquisitionDashboard(report: AcquisitionReport) {
  const channels = [...report.channels]
    .filter((channel) => channel.newCustomers > 0)
    .sort(
      (a, b) =>
        b.newCustomers - a.newCustomers ||
        a.acquisitionChannelName.localeCompare(b.acquisitionChannelName)
    );

  return {
    newCustomers: report.channels.reduce((sum, channel) => sum + channel.newCustomers, 0),
    observedReturningCustomers: report.channels.reduce(
      (sum, channel) => sum + channel.observedReturningCustomers,
      0
    ),
    topChannels: channels.slice(0, 3)
  };
}
