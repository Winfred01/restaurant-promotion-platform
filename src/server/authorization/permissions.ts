import { MembershipRole } from "@prisma/client";

export const Permission = {
  CUSTOMER_LOOKUP: "customer:lookup",
  CUSTOMER_CREATE: "customer:create",
  ACQUISITION_CHANNEL_CAPTURE: "acquisition-channel:capture",
  ACQUISITION_CHANNEL_MANAGE: "acquisition-channel:manage",
  PROMOTION_ELIGIBILITY_VIEW: "promotion:eligibility:view",
  PROMOTION_CLAIM: "promotion:claim",
  PROMOTION_MANAGE: "promotion:manage",
  BEST_DEAL_VIEW: "best-deal:view",
  REDEMPTION_CREATE: "redemption:create",
  REDEMPTION_VOID: "redemption:void",
  BRANCH_ANALYTICS_VIEW: "analytics:branch:view",
  ORGANIZATION_ANALYTICS_VIEW: "analytics:organization:view",
  ORGANIZATION_MANAGE: "organization:manage",
  BRANCH_MANAGE: "branch:manage",
  MEMBERSHIP_MANAGE: "membership:manage",
  SETTINGS_MANAGE: "settings:manage",
  AUDIT_LOG_VIEW: "audit-log:view"
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

const staffPermissions = [
  Permission.CUSTOMER_LOOKUP,
  Permission.CUSTOMER_CREATE,
  Permission.ACQUISITION_CHANNEL_CAPTURE,
  Permission.PROMOTION_ELIGIBILITY_VIEW,
  Permission.PROMOTION_CLAIM,
  Permission.BEST_DEAL_VIEW,
  Permission.REDEMPTION_CREATE
] as const satisfies readonly Permission[];

const managerPermissions = [
  ...staffPermissions,
  Permission.ACQUISITION_CHANNEL_MANAGE,
  Permission.PROMOTION_MANAGE,
  Permission.REDEMPTION_VOID,
  Permission.BRANCH_ANALYTICS_VIEW
] as const satisfies readonly Permission[];

const ownerPermissions = [
  ...managerPermissions,
  Permission.ORGANIZATION_ANALYTICS_VIEW,
  Permission.ORGANIZATION_MANAGE,
  Permission.BRANCH_MANAGE,
  Permission.MEMBERSHIP_MANAGE,
  Permission.SETTINGS_MANAGE,
  Permission.AUDIT_LOG_VIEW
] as const satisfies readonly Permission[];

export const ROLE_PERMISSIONS: Readonly<Record<MembershipRole, readonly Permission[]>> = {
  [MembershipRole.STAFF]: staffPermissions,
  [MembershipRole.MANAGER]: managerPermissions,
  [MembershipRole.OWNER]: ownerPermissions
};

const branchScopedPermissions = new Set<Permission>([
  Permission.CUSTOMER_LOOKUP,
  Permission.CUSTOMER_CREATE,
  Permission.ACQUISITION_CHANNEL_CAPTURE,
  Permission.ACQUISITION_CHANNEL_MANAGE,
  Permission.PROMOTION_ELIGIBILITY_VIEW,
  Permission.PROMOTION_CLAIM,
  Permission.PROMOTION_MANAGE,
  Permission.BEST_DEAL_VIEW,
  Permission.REDEMPTION_CREATE,
  Permission.REDEMPTION_VOID,
  Permission.BRANCH_ANALYTICS_VIEW
]);

export function hasPermission(role: MembershipRole, permission: Permission) {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function requiresBranchScope(permission: Permission) {
  return branchScopedPermissions.has(permission);
}
