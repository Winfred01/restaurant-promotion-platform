import { MembershipRole } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { hasPermission, Permission } from "./permissions";

describe("RBAC permission matrix", () => {
  const allPermissions = Object.values(Permission);
  const expectedPermissions: Readonly<Record<MembershipRole, readonly Permission[]>> = {
    [MembershipRole.STAFF]: [
      Permission.CUSTOMER_LOOKUP,
      Permission.CUSTOMER_CREATE,
      Permission.ACQUISITION_CHANNEL_CAPTURE,
      Permission.PROMOTION_ELIGIBILITY_VIEW,
      Permission.PROMOTION_CLAIM,
      Permission.BEST_DEAL_VIEW,
      Permission.REDEMPTION_CREATE
    ],
    [MembershipRole.MANAGER]: [
      Permission.CUSTOMER_LOOKUP,
      Permission.CUSTOMER_CREATE,
      Permission.ACQUISITION_CHANNEL_CAPTURE,
      Permission.PROMOTION_ELIGIBILITY_VIEW,
      Permission.PROMOTION_CLAIM,
      Permission.BEST_DEAL_VIEW,
      Permission.REDEMPTION_CREATE,
      Permission.ACQUISITION_CHANNEL_MANAGE,
      Permission.PROMOTION_MANAGE,
      Permission.REDEMPTION_VOID,
      Permission.BRANCH_ANALYTICS_VIEW
    ],
    [MembershipRole.OWNER]: allPermissions
  };

  it.each(Object.values(MembershipRole))(
    "matches the complete allow/deny matrix for %s",
    (role) => {
      for (const permission of allPermissions) {
        expect(hasPermission(role, permission), `${role} ${permission}`).toBe(
          expectedPermissions[role].includes(permission)
        );
      }
    }
  );
});
