import { prisma } from "@/server/db";
import { createStaffCheckoutWorkflow } from "@/server/redemptions/staff-checkout";
import { createStaffCheckoutRouteHandler } from "@/server/redemptions/staff-checkout-http";

export const POST = createStaffCheckoutRouteHandler(createStaffCheckoutWorkflow(prisma));
