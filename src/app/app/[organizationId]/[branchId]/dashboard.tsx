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
            <h3 className="mt-6 font-semibold text-slate-950">Top acquisition channels</h3>
            {channel.topChannels.length ? (
              <ol className="mt-3 space-y-2">
                {channel.topChannels.map((entry) => (
                  <li
                    className="flex justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
                    key={entry.acquisitionChannelId ?? "unattributed"}
                  >
                    <span>{entry.acquisitionChannelName}</span>
                    <span>{entry.newCustomers} customers</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 rounded-xl bg-slate-100 p-4 text-slate-700">
                No customers have been recorded yet.
              </p>
            )}
            <p className="mt-4 text-sm text-slate-600">
              A return means at least two completed redemptions with bill amounts. Unpromoted visits
              and sales are not recorded, so these observed totals are lower bounds.
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
