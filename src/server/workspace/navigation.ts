import { MembershipRole } from "@prisma/client";

import { hasPermission, Permission } from "@/server/authorization/permissions";

export type WorkspaceLink = { label: string; href: string };

export function workspaceLinks(basePath: string, role: MembershipRole): WorkspaceLink[] {
  const links = [{ label: "Overview", href: basePath }];

  if (hasPermission(role, Permission.PROMOTION_MANAGE)) {
    links.push({ label: "Manager area", href: `${basePath}/manager` });
  }

  if (hasPermission(role, Permission.ORGANIZATION_MANAGE)) {
    links.push({ label: "Owner area", href: `${basePath}/owner` });
  }

  return links;
}
