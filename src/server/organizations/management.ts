import { BranchStatus, MembershipRole, Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import { createPrismaAuthorizationGuard } from "@/server/authorization/guard";
import { Permission } from "@/server/authorization/permissions";
import { createRetryingTransactionClient } from "@/server/serializable-transaction";

const id = z.string().trim().min(1).max(191);
const details = z.object({
  name: z.string().trim().min(1, "Enter a branch name.").max(100),
  timezone: z.string().trim().min(1, "Enter a timezone.").max(100)
});
const actor = z.object({ organizationId: id, actorUserId: id });

export class BranchUnavailableError extends Error {
  constructor() {
    super("Branch is unavailable.");
    this.name = "BranchUnavailableError";
  }
}

export class LastActiveBranchError extends Error {
  constructor() {
    super("Create another active branch before archiving the last one.");
    this.name = "LastActiveBranchError";
  }
}

function parseDetails(input: { name: string; timezone: string }) {
  const value = details.parse(input);
  try {
    new Intl.DateTimeFormat("en", { timeZone: value.timezone });
  } catch {
    throw new Error("Enter a valid IANA timezone.");
  }
  return value;
}

function snapshot(branch: { id: string; name: string; timezone: string; status: BranchStatus }) {
  return { id: branch.id, name: branch.name, timezone: branch.timezone, status: branch.status };
}

export function createBranchManagementService(db: PrismaClient) {
  const retrying = createRetryingTransactionClient(db);
  async function authorize(transaction: Prisma.TransactionClient, input: z.infer<typeof actor>) {
    await createPrismaAuthorizationGuard(transaction).requireOrganizationPermission({
      organizationId: input.organizationId,
      userId: input.actorUserId,
      permission: Permission.BRANCH_MANAGE
    });
  }

  async function audit(
    transaction: Prisma.TransactionClient,
    input: z.infer<typeof actor>,
    action: string,
    branch: { id: string; name: string; timezone: string; status: BranchStatus },
    before?: ReturnType<typeof snapshot>
  ) {
    await transaction.auditLog.create({
      data: {
        organizationId: input.organizationId,
        branchId: branch.id,
        actorUserId: input.actorUserId,
        actorRole: MembershipRole.OWNER,
        action,
        entityType: "Branch",
        entityId: branch.id,
        beforeJson: before,
        afterJson: snapshot(branch)
      }
    });
  }

  return {
    async create(input: {
      organizationId: string;
      actorUserId: string;
      name: string;
      timezone: string;
    }) {
      const context = actor.parse(input);
      const value = parseDetails(input);
      return retrying.$transaction(async (transaction) => {
        await authorize(transaction, context);
        const branch = await transaction.branch.create({
          data: { organizationId: context.organizationId, ...value }
        });
        await audit(transaction, context, "BRANCH_CREATED", branch);
        return branch;
      });
    },

    async edit(input: {
      organizationId: string;
      actorUserId: string;
      branchId: string;
      name: string;
      timezone: string;
    }) {
      const context = actor.parse(input);
      const branchId = id.parse(input.branchId);
      const value = parseDetails(input);
      return retrying.$transaction(async (transaction) => {
        await authorize(transaction, context);
        const branch = await transaction.branch.findFirst({
          where: {
            id: branchId,
            organizationId: context.organizationId,
            status: { not: BranchStatus.ARCHIVED }
          }
        });
        if (!branch) throw new BranchUnavailableError();
        const result = await transaction.branch.updateMany({
          where: {
            id: branchId,
            organizationId: context.organizationId,
            status: { not: BranchStatus.ARCHIVED }
          },
          data: value
        });
        if (result.count !== 1) throw new BranchUnavailableError();
        const updated = { ...branch, ...value };
        await audit(transaction, context, "BRANCH_UPDATED", updated, snapshot(branch));
        return updated;
      });
    },

    async archive(input: { organizationId: string; actorUserId: string; branchId: string }) {
      const context = actor.parse(input);
      const branchId = id.parse(input.branchId);
      return retrying.$transaction(
        async (transaction) => {
          await authorize(transaction, context);
          const branch = await transaction.branch.findFirst({
            where: {
              id: branchId,
              organizationId: context.organizationId,
              status: { not: BranchStatus.ARCHIVED }
            }
          });
          if (!branch) throw new BranchUnavailableError();
          if (branch.status === BranchStatus.ACTIVE) {
            const activeCount = await transaction.branch.count({
              where: { organizationId: context.organizationId, status: BranchStatus.ACTIVE }
            });
            if (activeCount <= 1) throw new LastActiveBranchError();
          }
          const result = await transaction.branch.updateMany({
            where: {
              id: branchId,
              organizationId: context.organizationId,
              status: { not: BranchStatus.ARCHIVED }
            },
            data: { status: BranchStatus.ARCHIVED }
          });
          if (result.count !== 1) throw new BranchUnavailableError();
          const archived = { ...branch, status: BranchStatus.ARCHIVED };
          await audit(transaction, context, "BRANCH_ARCHIVED", archived, snapshot(branch));
          return archived;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    }
  };
}
