import { prisma } from "@/server/db";
import { createStaffCustomerRouteHandlers } from "@/server/customers/staff-http";
import { createStaffCustomerWorkflow } from "@/server/customers/staff-workflow";

export const { GET, POST } = createStaffCustomerRouteHandlers(
  createStaffCustomerWorkflow({ db: prisma })
);
