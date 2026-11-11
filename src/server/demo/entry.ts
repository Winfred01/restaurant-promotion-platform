import { createHash, randomBytes } from "node:crypto";

import { MembershipRole, type PrismaClient } from "@prisma/client";

import { earliestFreshDemoFixture } from "./fixture-age";

export function isGuidedDemoEnabled(env: Record<string, string | undefined> = process.env) {
  if (env.DEMO_PUBLIC_ENTRY !== "1" || !env.AUTH_SECRET || env.AUTH_SECRET.length < 32) {
    return false;
  }
  try {
    const url = new URL(env.DATABASE_URL ?? "");
    const databaseName = decodeURIComponent(url.pathname.slice(1));
    if (env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview") {
      const stage = env.VERCEL_ENV === "production" ? "public" : "preview";
      if (
        env.DEMO_FIXTURES_ONLY !== "1" ||
        databaseName !== `restaurant_promotion_${stage}_demo` ||
        !url.hostname.split(".")[0].endsWith("-pooler") ||
        !["require", "verify-full"].includes(url.searchParams.get("sslmode") ?? "")
      ) {
        return false;
      }
    }
    return (
      ["postgres:", "postgresql:"].includes(url.protocol) &&
      databaseName.toLowerCase().includes("demo")
    );
  } catch {
    return false;
  }
}

export function parseDemoRole(value: unknown): MembershipRole | null {
  if (
    value === MembershipRole.OWNER ||
    value === MembershipRole.MANAGER ||
    value === MembershipRole.STAFF
  ) {
    return value;
  }
  return null;
}

const hashTicket = (ticket: string) => createHash("sha256").update(ticket).digest("hex");

export async function claimDemoTenant(db: PrismaClient, role: MembershipRole) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await db.$transaction(async (tx) => {
      const lease = await tx.demoTenantLease.findFirst({
        where: { status: "AVAILABLE", createdAt: { gte: earliestFreshDemoFixture() } },
        orderBy: { createdAt: "asc" },
        select: { id: true, organizationId: true }
      });
      if (!lease) return null;

      const membership = await tx.organizationMembership.findFirst({
        where: {
          organizationId: lease.organizationId,
          role,
          status: "ACTIVE",
          user: { status: "ACTIVE" },
          organization: { status: "ACTIVE" }
        },
        select: { userId: true }
      });
      if (!membership) throw new Error("The demo tenant is missing its role account.");

      const ticket = randomBytes(32).toString("hex");
      const now = new Date();
      const claimed = await tx.demoTenantLease.updateMany({
        where: { id: lease.id, status: "AVAILABLE" },
        data: {
          status: "CLAIMED",
          selectedRole: role,
          selectedUserId: membership.userId,
          ticketHash: hashTicket(ticket),
          ticketExpiresAt: new Date(now.getTime() + 60_000),
          claimedAt: now
        }
      });
      if (claimed.count !== 1) return undefined;

      await tx.auditLog.create({
        data: {
          organizationId: lease.organizationId,
          actorUserId: membership.userId,
          actorRole: role,
          action: "DEMO_VISIT_CLAIMED",
          entityType: "RestaurantOrganization",
          entityId: lease.organizationId,
          afterJson: { role }
        }
      });
      return ticket;
    });
    if (result !== undefined) return result;
  }
  return null;
}

export async function consumeDemoTicket(db: PrismaClient, ticket: unknown) {
  if (typeof ticket !== "string" || !/^[a-f0-9]{64}$/.test(ticket)) return null;
  const now = new Date();
  return db.$transaction(async (tx) => {
    const lease = await tx.demoTenantLease.findUnique({
      where: { ticketHash: hashTicket(ticket) },
      select: {
        id: true,
        organizationId: true,
        selectedRole: true,
        selectedUserId: true,
        ticketExpiresAt: true
      }
    });
    if (
      !lease?.selectedRole ||
      !lease.selectedUserId ||
      !lease.ticketExpiresAt ||
      lease.ticketExpiresAt <= now
    ) {
      return null;
    }
    const consumed = await tx.demoTenantLease.updateMany({
      where: {
        id: lease.id,
        ticketHash: hashTicket(ticket),
        status: "CLAIMED",
        ticketExpiresAt: { gt: now }
      },
      data: { ticketHash: null, ticketExpiresAt: null }
    });
    if (consumed.count !== 1) return null;

    const user = await tx.user.findFirst({
      where: {
        id: lease.selectedUserId,
        status: "ACTIVE",
        organizationMemberships: {
          some: {
            organizationId: lease.organizationId,
            role: lease.selectedRole,
            status: "ACTIVE",
            organization: { status: "ACTIVE" }
          }
        }
      },
      select: { id: true, email: true, name: true }
    });
    if (!user) return null;
    return { ...user, demoLeaseId: lease.id };
  });
}
