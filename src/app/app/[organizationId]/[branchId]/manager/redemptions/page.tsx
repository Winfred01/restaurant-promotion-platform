import { RedemptionStatus } from "@prisma/client";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentEmployeeSession } from "@/server/auth/session";
import { AuthorizationDeniedError } from "@/server/authorization/guard";
import { prisma } from "@/server/db";
import { createRedemptionHistoryService } from "@/server/redemptions/history";

import { voidRedemptionAction } from "./actions";
import { VoidForm } from "./void-form";

type StatusFilter = "ALL" | RedemptionStatus;

function statusFilter(value: string | undefined): StatusFilter {
  return value === RedemptionStatus.COMPLETED || value === RedemptionStatus.VOIDED ? value : "ALL";
}

function money(cents: number | null, currency: string) {
  return cents === null
    ? "Not recorded"
    : new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(cents / 100);
}

export default async function RedemptionHistoryPage({
  params,
  searchParams
}: {
  params: Promise<{ organizationId: string; branchId: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await getCurrentEmployeeSession();
  if (!session) redirect("/login");

  const { organizationId, branchId } = await params;
  const { status: requestedStatus } = await searchParams;
  const status = statusFilter(requestedStatus);
  let rows;
  try {
    rows = await createRedemptionHistoryService(prisma).list({
      organizationId,
      branchId,
      actorUserId: session.user.id,
      status
    });
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) notFound();
    throw error;
  }
  const organization = await prisma.restaurantOrganization.findUnique({
    where: { id: organizationId },
    select: { currency: true }
  });
  if (!organization) notFound();

  const basePath = `/app/${organizationId}/${branchId}/manager/redemptions`;
  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-800">
          Manager and Owner
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">Redemption history</h1>
        <p className="mt-2 text-slate-700">
          Recent redemptions for this branch. Voided entries remain in the history and are excluded
          from promotion-linked sales.
        </p>
      </div>
      <nav aria-label="Redemption status" className="flex flex-wrap gap-2">
        {(["ALL", RedemptionStatus.COMPLETED, RedemptionStatus.VOIDED] as const).map((option) => (
          <Link
            aria-current={status === option ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${status === option ? "bg-teal-800 text-white" : "bg-slate-100 text-slate-800"}`}
            href={option === "ALL" ? basePath : `${basePath}?status=${option}`}
            key={option}
          >
            {option === "ALL"
              ? "All"
              : option === RedemptionStatus.COMPLETED
                ? "Completed"
                : "Voided"}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-slate-700">
          No redemptions match this status in the selected branch.
        </p>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <article className="rounded-xl border border-slate-200 bg-white p-5" key={row.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">
                    {row.promotionName} · {row.status}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Redeemed {row.redeemedAt.toISOString()} · Staff: {row.staffName}
                  </p>
                </div>
                <span className="text-sm font-medium text-slate-700">{row.customerPhone}</span>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-slate-600">Receipt</dt>
                  <dd className="font-medium">{row.receiptNumber ?? "Not recorded"}</dd>
                </div>
                <div>
                  <dt className="text-slate-600">Subtotal</dt>
                  <dd className="font-medium">
                    {money(row.billSubtotalCents, organization.currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-600">Discount</dt>
                  <dd className="font-medium">{money(row.discountCents, organization.currency)}</dd>
                </div>
                <div>
                  <dt className="text-slate-600">Net amount</dt>
                  <dd className="font-medium">{money(row.netBillCents, organization.currency)}</dd>
                </div>
              </dl>
              {row.status === RedemptionStatus.VOIDED ? (
                <div className="mt-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
                  Voided {row.voidedAt?.toISOString() ?? ""} by {row.voidedByName ?? "Unknown"}.
                  Reason: {row.voidReason ?? "Not recorded"}
                </div>
              ) : (
                <VoidForm
                  action={voidRedemptionAction.bind(null, {
                    organizationId,
                    branchId,
                    redemptionId: row.id
                  })}
                />
              )}
            </article>
          ))}
          <p className="text-sm text-slate-600">
            Showing the 100 most recent matching redemptions.
          </p>
        </div>
      )}
    </section>
  );
}
