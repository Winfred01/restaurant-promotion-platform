import { prisma } from "@/server/db";
import { createPublicClaimService } from "@/server/promotions/public-claim";
import { createPublicClaimRouteHandler } from "@/server/promotions/public-claim-http";

export const POST = createPublicClaimRouteHandler(createPublicClaimService(prisma));
