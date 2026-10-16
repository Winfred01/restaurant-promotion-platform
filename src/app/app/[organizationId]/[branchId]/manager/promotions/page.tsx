import { MembershipRole, PromotionStatus } from "@prisma/client";
import { notFound, redirect } from "next/navigation";

import { getCurrentEmployeeSession } from "@/server/auth/session";
import {
  AuthorizationDeniedError,
  createPrismaAuthorizationGuard
} from "@/server/authorization/guard";
import { Permission } from "@/server/authorization/permissions";
import { prisma } from "@/server/db";
import { changePromotionStatus, savePromotion } from "./actions";
import { PromotionForm, PromotionStatusForm, type FormPromotion } from "./promotion-form";

type Params = Promise<{ organizationId: string; branchId: string }>;
const editableStatuses = new Set<PromotionStatus>([
  PromotionStatus.DRAFT,
  PromotionStatus.SCHEDULED,
  PromotionStatus.ACTIVE,
  PromotionStatus.PAUSED
]);
const archiveStatuses = new Set<PromotionStatus>([
  PromotionStatus.DRAFT,
  PromotionStatus.SCHEDULED,
  PromotionStatus.PAUSED,
  PromotionStatus.ENDED
]);
const activateStatuses = new Set<PromotionStatus>([
  PromotionStatus.DRAFT,
  PromotionStatus.SCHEDULED,
  PromotionStatus.PAUSED
]);

export default async function PromotionManagementPage({ params }: { params: Params }) {
  const session = await getCurrentEmployeeSession();
  if (!session) redirect("/login");
  const { organizationId, branchId } = await params;
  let role: MembershipRole;
  try {
    ({ role } = await createPrismaAuthorizationGuard(prisma).requireBranchPermission({
      organizationId,
      branchId,
      userId: session.user.id,
      permission: Permission.PROMOTION_MANAGE
    }));
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) notFound();
    throw error;
  }

  const owner = role === MembershipRole.OWNER;
  const [branches, promotions] = await Promise.all([
    prisma.branch.findMany({
      where: { organizationId, status: "ACTIVE", ...(!owner && { id: branchId }) },
      select: { id: true, name: true },
      orderBy: { name: "asc" }
    }),
    prisma.promotion.findMany({
      where: {
        organizationId,
        ...(!owner && {
          OR: [{ appliesToAllBranches: true }, { branches: { some: { branchId } } }]
        })
      },
      include: { branches: { select: { branchId: true } } },
      orderBy: { createdAt: "desc" }
    })
  ]);

  const createAction = savePromotion.bind(null, { organizationId, branchId });
  return (
    <>
      <p className="text-sm font-semibold uppercase tracking-widest text-teal-700">Manager tools</p>
      <h1 className="mt-3 text-3xl font-semibold text-slate-950">Promotions</h1>
      <p className="mt-3 max-w-3xl text-slate-700">
        Create a draft, select its branches, then activate it for checkout. Pausing stops a live
        offer; archived offers stay in history. Times are entered in UTC.
      </p>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold">Create promotion</h2>
        <PromotionForm action={createAction} branches={branches} owner={owner} />
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Existing promotions</h2>
        {promotions.length === 0 && (
          <p className="mt-4 rounded-xl border border-slate-200 bg-white p-5 text-slate-600">
            No promotions are available for this branch yet.
          </p>
        )}
        <div className="mt-4 space-y-5">
          {promotions.map((promotion) => {
            const branchIds = promotion.branches.map(({ branchId: id }) => id);
            const canManage =
              owner ||
              (!promotion.appliesToAllBranches &&
                branchIds.length === 1 &&
                branchIds[0] === branchId);
            const formPromotion: FormPromotion = {
              name: promotion.name,
              description: promotion.description ?? "",
              rewardType: promotion.rewardType,
              discountCents: promotion.discountCents,
              discountPercent: promotion.discountPercent,
              maxDiscountCents: promotion.maxDiscountCents,
              minimumSpendCents: promotion.minimumSpendCents,
              validFrom: promotion.validFrom?.toISOString().slice(0, 16) ?? "",
              validUntil: promotion.validUntil?.toISOString().slice(0, 16) ?? "",
              appliesToAllBranches: promotion.appliesToAllBranches,
              branchIds
            };
            const context = { organizationId, branchId, promotionId: promotion.id };
            return (
              <article
                className="rounded-2xl border border-slate-200 bg-white p-6"
                key={promotion.id}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-lg font-semibold">{promotion.name}</h3>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {promotion.status}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {promotion.appliesToAllBranches
                    ? "All branches"
                    : `Selected branches: ${branchIds.length}`}
                </p>
                {!canManage ? (
                  <p className="mt-4 text-sm text-slate-600">
                    This offer is visible at this branch. An Owner can manage its organization-wide
                    or multi-branch targeting.
                  </p>
                ) : (
                  <>
                    {editableStatuses.has(promotion.status) && (
                      <details className="mt-4">
                        <summary className="cursor-pointer font-semibold text-teal-800">
                          Edit details
                        </summary>
                        <PromotionForm
                          action={savePromotion.bind(null, context)}
                          branches={branches}
                          owner={owner}
                          promotion={formPromotion}
                        />
                      </details>
                    )}
                    {promotion.status !== PromotionStatus.ARCHIVED && (
                      <PromotionStatusForm
                        action={changePromotionStatus.bind(null, context)}
                        canActivate={activateStatuses.has(promotion.status)}
                        canPause={promotion.status === PromotionStatus.ACTIVE}
                        canArchive={archiveStatuses.has(promotion.status)}
                      />
                    )}
                  </>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
