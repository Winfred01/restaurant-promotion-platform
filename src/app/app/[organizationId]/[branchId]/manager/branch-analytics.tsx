import Link from "next/link";
import {
  summarizePromotionDashboard,
  type PromotionReport
} from "@/server/analytics/dashboard-summary";

export function BranchAnalytics({
  report,
  currency,
  basePath
}: {
  report: PromotionReport;
  currency: string;
  basePath: string;
}) {
  const summary = summarizePromotionDashboard(report);
  const money = (cents: number) =>
    new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(cents / 100);
  const count = (value: number) => new Intl.NumberFormat("en-CA").format(value);
  const gross = report.promotions.reduce((sum, p) => sum + p.grossBillCents, 0);
  const claims = report.promotions.reduce((sum, p) => sum + p.claimCount, 0);
  const recorded = report.promotions.reduce((sum, p) => sum + p.redemptionsWithBillAmounts, 0);
  const rows = [...report.promotions].sort(
    (a, b) => b.netBillCents - a.netBillCents || a.promotionName.localeCompare(b.promotionName)
  );
  const maxSales = Math.max(0, ...rows.map((p) => p.netBillCents));

  return (
    <div className="branch-analytics">
      <a className="analytics-skip" href="#promotion-performance">
        Skip to promotion performance
      </a>
      <header className="analytics-heading">
        <div>
          <p className="analytics-eyebrow">
            Branch dashboard <span aria-hidden="true">/</span> Analytics
          </p>
          <h1>Branch performance</h1>
          <p>
            {count(summary.completedRedemptions)} completed redemptions ·{" "}
            {count(summary.activePromotions)} active promotions at this branch.
          </p>
        </div>
        <Link
          className="analytics-button analytics-primary"
          href={`${basePath}/manager/promotions`}
        >
          Manage promotions <span aria-hidden="true">↗</span>
        </Link>
      </header>

      <div className="analytics-period">
        <span>
          <span className="analytics-status-dot" aria-hidden="true" />
          All-time activity
        </span>
        <span>Selected branch only · {currency}</span>
      </div>

      <section className="analytics-overview" aria-labelledby="sales-heading">
        <div className="analytics-sales">
          <h2 id="sales-heading">Promotion-linked sales</h2>
          <p className="analytics-sales-value">{money(summary.promotionLinkedSalesCents)}</p>
          <p>Net bill amount after discounts</p>
          <Link className="analytics-text-link" href={`${basePath}/manager/redemptions`}>
            Review redemption history <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className="analytics-reconciliation">
          <h2>From bill to recorded sales</h2>
          <dl>
            <div>
              <dt>Gross bill amount</dt>
              <dd>{money(gross)}</dd>
            </div>
            <div>
              <dt>Discount given</dt>
              <dd>−{money(summary.discountCents)}</dd>
            </div>
            <div className="analytics-net">
              <dt>Net bill amount</dt>
              <dd>{money(summary.promotionLinkedSalesCents)}</dd>
            </div>
          </dl>
          <p>
            {count(recorded)} redemptions with recorded bill amounts. Voided redemptions excluded.
          </p>
        </div>
      </section>

      <dl className="analytics-metrics">
        <div>
          <dt>Completed redemptions</dt>
          <dd>{count(summary.completedRedemptions)}</dd>
        </div>
        <div>
          <dt>Claims recorded</dt>
          <dd>{count(claims)}</dd>
        </div>
        <div>
          <dt>Active promotions</dt>
          <dd>{count(summary.activePromotions)}</dd>
        </div>
        <div>
          <dt>Average gross bill</dt>
          <dd>
            {recorded > 0 ? (
              money(Math.round(gross / recorded))
            ) : (
              <span className="analytics-missing">—</span>
            )}
          </dd>
        </div>
      </dl>

      <section
        className="analytics-performance"
        id="promotion-performance"
        aria-labelledby="performance-heading"
        tabIndex={-1}
      >
        <div className="analytics-section-heading">
          <div>
            <h2 id="performance-heading">Promotion performance</h2>
            <p>{count(rows.length)} promotions · Highest net sales first</p>
          </div>
          <Link className="analytics-text-link" href={`${basePath}/checkout`}>
            Open checkout <span aria-hidden="true">↗</span>
          </Link>
        </div>
        {rows.length === 0 ? (
          <div className="analytics-empty">
            <h3>No promotions yet</h3>
            <p>Create and activate your first offer to begin recording promotion activity.</p>
            <Link className="analytics-text-link" href={`${basePath}/manager/promotions`}>
              Create a promotion →
            </Link>
          </div>
        ) : (
          <div className="analytics-table-wrap">
            <table>
              <caption className="analytics-sr-only">
                All-time promotion results at the selected branch. Sales exclude voided redemptions.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Promotion</th>
                  <th scope="col" className="analytics-number">
                    Claims / redeemed
                  </th>
                  <th scope="col" className="analytics-number">
                    Gross bill
                  </th>
                  <th scope="col" className="analytics-number">
                    Discount
                  </th>
                  <th scope="col" className="analytics-number">
                    Net sales
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.promotionId}>
                    <th scope="row">
                      <span className="analytics-promotion-name">{p.promotionName}</span>
                      <span className="analytics-promotion-state">
                        <span
                          className={`analytics-state ${p.promotionStatus === "ACTIVE" ? "analytics-state-active" : ""}`}
                        >
                          {p.promotionStatus.charAt(0) + p.promotionStatus.slice(1).toLowerCase()}
                        </span>
                        <span>{count(p.uniqueCustomers)} unique customers</span>
                      </span>
                    </th>
                    <td className="analytics-number" data-label="Claims / redeemed">
                      <span>
                        {count(p.claimCount)} / {count(p.redemptionCount)}
                      </span>
                      <span className="analytics-cell-note">
                        {p.redemptionRateBasisPoints === null
                          ? "Rate unavailable"
                          : `${(p.redemptionRateBasisPoints / 100).toFixed(2)}% redemption rate`}
                      </span>
                    </td>
                    <td className="analytics-number" data-label="Gross bill">
                      {money(p.grossBillCents)}
                    </td>
                    <td className="analytics-number" data-label="Discount">
                      {money(p.totalDiscountCents)}
                    </td>
                    <td className="analytics-number analytics-net-sales" data-label="Net sales">
                      <span>{money(p.netBillCents)}</span>
                      <span className="analytics-sales-track" aria-hidden="true">
                        <span
                          style={{
                            width: `${maxSales > 0 ? (p.netBillCents / maxSales) * 100 : 0}%`
                          }}
                        />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="analytics-notes">
        <section>
          <h2>What these sales mean</h2>
          <p>
            Recorded bills from completed promotion redemptions only. Older redemptions without bill
            amounts do not add to sales. These totals do not measure incremental revenue.
          </p>
        </section>
        <section>
          <h2>Customer acquisition</h2>
          <p>
            Original-channel analytics are organization-wide and available to Owners. Customers do
            not have a first-branch attribution.
          </p>
        </section>
      </footer>
    </div>
  );
}
