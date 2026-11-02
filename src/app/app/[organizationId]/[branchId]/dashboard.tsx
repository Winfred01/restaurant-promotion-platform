import Link from "next/link";

import {
  summarizeAcquisitionDashboard,
  summarizePromotionDashboard,
  type AcquisitionReport,
  type PromotionReport
} from "@/server/analytics/dashboard-summary";

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(cents / 100);
}

function count(value: number) {
  return new Intl.NumberFormat("en-CA").format(value);
}

function rate(basisPoints: number | null) {
  return basisPoints === null ? "—" : `${(basisPoints / 100).toFixed(2)}%`;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd className="mt-2 text-2xl font-semibold text-slate-950">{value}</dd>
    </div>
  );
}

export function Dashboard({
  scope,
  report,
  acquisition,
  currency,
  basePath
}: {
  scope: "branch" | "organization";
  report: PromotionReport;
  acquisition?: AcquisitionReport;
  currency: string;
  basePath: string;
}) {
  const promotion = summarizePromotionDashboard(report);
  const channel = acquisition ? summarizeAcquisitionDashboard(acquisition) : null;
  const promotionRows = [...report.promotions].sort(
    (a, b) => b.netBillCents - a.netBillCents || a.promotionName.localeCompare(b.promotionName)
  );
  const channelRows = acquisition
    ? acquisition.channels
        .filter((entry) => entry.newCustomers > 0)
        .sort(
          (a, b) =>
            b.newCustomers - a.newCustomers ||
            a.acquisitionChannelName.localeCompare(b.acquisitionChannelName)
        )
    : [];

  return (
    <>
      <p className="text-sm font-semibold uppercase tracking-widest text-teal-700">
        {scope === "branch" ? "Branch dashboard" : "Organization dashboard"}
      </p>
      <h1 className="mt-3 text-3xl font-semibold text-slate-950">
        {scope === "branch" ? "Branch performance" : "Restaurant performance"}
      </h1>
      <p className="mt-4 max-w-2xl text-slate-700">
        {scope === "branch"
          ? "Promotion activity at this branch. Other branches are outside this view."
          : "Promotion activity across this restaurant organization."}
      </p>

      <section aria-labelledby="promotion-heading" className="mt-10">
        <h2 id="promotion-heading" className="text-xl font-semibold text-slate-950">
          Promotion activity
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <Metric label="Active promotions" value={promotion.activePromotions} />
          <Metric label="Completed redemptions" value={promotion.completedRedemptions} />
          <Metric
            label="Promotion-linked sales"
            value={money(promotion.promotionLinkedSalesCents, currency)}
          />
          <Metric label="Total discount" value={money(promotion.discountCents, currency)} />
        </dl>
        {report.promotions.length === 0 && (
          <p className="mt-4 rounded-xl bg-slate-100 p-4 text-slate-700">
            No promotions yet. Create and activate one to start this report.
          </p>
        )}
        {promotionRows.length > 0 && (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <caption className="mb-3 text-left font-semibold text-slate-950">
                Promotion results · completed redemptions only
              </caption>
              <thead className="text-slate-600">
                <tr className="border-b border-slate-200">
                  <th className="py-2 pr-4 text-left font-medium" scope="col">
                    Promotion
                  </th>
                  <th className="px-2 py-2 text-right font-medium" scope="col">
                    Claims
                  </th>
                  <th className="px-2 py-2 text-right font-medium" scope="col">
                    Redeemed
                  </th>
                  <th className="px-2 py-2 text-right font-medium" scope="col">
                    Rate
                  </th>
                  <th className="px-2 py-2 text-right font-medium" scope="col">
                    Gross bill
                  </th>
                  <th className="px-2 py-2 text-right font-medium" scope="col">
                    Discount
                  </th>
                  <th className="px-2 py-2 text-right font-medium" scope="col">
                    Net bill
                  </th>
                  <th className="px-2 py-2 text-right font-medium" scope="col">
                    Average bill
                  </th>
                  <th className="pl-2 py-2 text-right font-medium" scope="col">
                    Customers
                  </th>
                </tr>
              </thead>
              <tbody>
                {promotionRows.map((entry) => (
                  <tr className="border-b border-slate-100" key={entry.promotionId}>
                    <th className="py-3 pr-4 text-left font-medium text-slate-950" scope="row">
                      {entry.promotionName}
                    </th>
                    <td className="px-2 py-3 text-right tabular-nums">{count(entry.claimCount)}</td>
                    <td className="px-2 py-3 text-right tabular-nums">
                      {count(entry.redemptionCount)}
                    </td>
                    <td className="px-2 py-3 text-right tabular-nums">
                      {rate(entry.redemptionRateBasisPoints)}
                    </td>
                    <td className="px-2 py-3 text-right tabular-nums">
                      {money(entry.grossBillCents, currency)}
                    </td>
                    <td className="px-2 py-3 text-right tabular-nums">
                      {money(entry.totalDiscountCents, currency)}
                    </td>
                    <td className="px-2 py-3 text-right font-medium tabular-nums">
                      {money(entry.netBillCents, currency)}
                    </td>
                    <td className="px-2 py-3 text-right tabular-nums">
                      {entry.averageBillCents === null
                        ? "—"
                        : money(entry.averageBillCents, currency)}
                    </td>
                    <td className="pl-2 py-3 text-right tabular-nums">
                      {count(entry.uniqueCustomers)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-sm text-slate-600">
          Sales and discounts are recorded bill amounts from completed promotion redemptions only;
          voided redemptions are excluded. Older redemptions without bill amounts do not add to
          sales.
        </p>
        <Link
          className="mt-4 inline-block font-semibold text-teal-800 underline"
          href={`${basePath}/manager/promotions`}
        >
          Manage promotions
        </Link>
      </section>

      <section
        aria-labelledby="acquisition-heading"
        className="mt-10 border-t border-slate-200 pt-8"
      >
        <h2 id="acquisition-heading" className="text-xl font-semibold text-slate-950">
          Customer acquisition
        </h2>
        {channel ? (
          <>
            <p className="mt-2 text-sm text-slate-600">
              Grouped by each customer&apos;s original acquisition channel across the organization.
            </p>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Metric label="New customers recorded" value={channel.newCustomers} />
              <Metric
                label="Observed returning customers"
                value={channel.observedReturningCustomers}
              />
            </dl>
            <h3 className="mt-6 font-semibold text-slate-950">Original channel results</h3>
            {channelRows.length ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[650px] border-collapse text-sm">
                  <caption className="sr-only">
                    Customers grouped by original acquisition channel across the organization
                  </caption>
                  <thead className="text-slate-600">
                    <tr className="border-b border-slate-200">
                      <th className="py-2 pr-4 text-left font-medium" scope="col">
                        Original channel
                      </th>
                      <th className="px-2 py-2 text-right font-medium" scope="col">
                        New customers
                      </th>
                      <th className="px-2 py-2 text-right font-medium" scope="col">
                        Observed returns
                      </th>
                      <th className="px-2 py-2 text-right font-medium" scope="col">
                        Observed return rate
                      </th>
                      <th className="px-2 py-2 text-right font-medium" scope="col">
                        Recorded spend
                      </th>
                      <th className="pl-2 py-2 text-right font-medium" scope="col">
                        Spend / customer
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {channelRows.map((entry) => (
                      <tr
                        className="border-b border-slate-100"
                        key={entry.acquisitionChannelId ?? "unattributed"}
                      >
                        <th className="py-3 pr-4 text-left font-medium text-slate-950" scope="row">
                          {entry.acquisitionChannelName}
                        </th>
                        <td className="px-2 py-3 text-right tabular-nums">
                          {count(entry.newCustomers)}
                        </td>
                        <td className="px-2 py-3 text-right tabular-nums">
                          {count(entry.observedReturningCustomers)}
                        </td>
                        <td className="px-2 py-3 text-right tabular-nums">
                          {rate(entry.observedReturnRateBasisPoints)}
                        </td>
                        <td className="px-2 py-3 text-right tabular-nums">
                          {money(entry.recordedSpendCents, currency)}
                        </td>
                        <td className="pl-2 py-3 text-right tabular-nums">
                          {entry.averageRecordedSpendPerCustomerCents === null
                            ? "—"
                            : money(entry.averageRecordedSpendPerCustomerCents, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-3 rounded-xl bg-slate-100 p-4 text-slate-700">
                No customers have been recorded yet.
              </p>
            )}
            <p className="mt-4 text-sm text-slate-600">
              A return means at least two completed redemptions with bill amounts. Spend is the net
              amount of completed promotion-linked bills, not lifetime spend. Unpromoted visits and
              sales are not recorded, so these observed totals are lower bounds.
            </p>
          </>
        ) : (
          <p className="mt-3 text-slate-700">
            Original-channel analytics are organization-wide and available to Owners. Customers do
            not have a first-branch attribution, so this branch dashboard does not assign them to a
            branch.
          </p>
        )}
      </section>
    </>
  );
}
