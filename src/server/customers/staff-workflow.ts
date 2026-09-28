import type { Customer, PrismaClient } from "@prisma/client";
import { z } from "zod";

import {
  getCurrentEmployeeSession,
  requireEmployeeSession,
  type EmployeeSession
} from "@/server/auth/session";
import { createPrismaAuthorizationGuard } from "@/server/authorization/guard";
import { Permission } from "@/server/authorization/permissions";
import { findOrCreateCustomer } from "./creation";
import { findCustomerByPhoneNumber } from "./lookup";

const tenantIdSchema = z.string().trim().min(1).max(191);
const phoneNumberSchema = z.string().trim().min(1).max(64);

const staffCustomerLookupSchema = z
  .object({
    organizationId: tenantIdSchema,
    branchId: tenantIdSchema,
    phoneNumber: phoneNumberSchema
  })
  .strict();

const staffCustomerCreationSchema = staffCustomerLookupSchema
  .extend({
    phoneNumberDisplay: z.string().trim().min(1).max(64).optional(),
    acquisitionChannelId: tenantIdSchema.optional()
  })
  .strict();

export type StaffCustomerView = {
  id: string;
  phoneNumberDisplay: string;
  acquisitionChannelId: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

export type StaffCustomerLookupResult = {
  customer: StaffCustomerView | null;
};

export type StaffCustomerCreationResult = {
  customer: StaffCustomerView;
  isNewCustomer: boolean;
};

export type StaffCustomerWorkflow = {
  lookup: (input: unknown) => Promise<StaffCustomerLookupResult>;
  create: (input: unknown) => Promise<StaffCustomerCreationResult>;
};

export type StaffCustomerWorkflowDependencies = {
  db: PrismaClient;
  loadSession?: () => Promise<EmployeeSession | null>;
};

function toStaffCustomerView(customer: Customer): StaffCustomerView {
  return {
    id: customer.id,
    phoneNumberDisplay: customer.phoneNumberDisplay,
    acquisitionChannelId: customer.acquisitionChannelId,
    firstSeenAt: customer.firstSeenAt,
    lastSeenAt: customer.lastSeenAt
  };
}

export function createStaffCustomerWorkflow({
  db,
  loadSession = getCurrentEmployeeSession
}: StaffCustomerWorkflowDependencies): StaffCustomerWorkflow {
  const authorization = createPrismaAuthorizationGuard(db);

  return {
    async lookup(input) {
      const session = await requireEmployeeSession(loadSession);
      const parsedInput = staffCustomerLookupSchema.parse(input);
      const context = await authorization.requireBranchPermission({
        organizationId: parsedInput.organizationId,
        branchId: parsedInput.branchId,
        userId: session.user.id,
        permission: Permission.CUSTOMER_LOOKUP
      });
      const customer = await findCustomerByPhoneNumber(db, {
        organizationId: context.organizationId,
        phoneNumber: parsedInput.phoneNumber
      });

      return {
        customer: customer ? toStaffCustomerView(customer) : null
      };
    },

    async create(input) {
      const session = await requireEmployeeSession(loadSession);
      const parsedInput = staffCustomerCreationSchema.parse(input);
      const context = await authorization.requireBranchPermission({
        organizationId: parsedInput.organizationId,
        branchId: parsedInput.branchId,
        userId: session.user.id,
        permission: Permission.CUSTOMER_CREATE
      });

      if (parsedInput.acquisitionChannelId) {
        await authorization.requireBranchPermission({
          organizationId: context.organizationId,
          branchId: context.branchId,
          userId: context.userId,
          permission: Permission.ACQUISITION_CHANNEL_CAPTURE
        });
      }

      const result = await findOrCreateCustomer(db, {
        organizationId: context.organizationId,
        phoneNumber: parsedInput.phoneNumber,
        phoneNumberDisplay: parsedInput.phoneNumberDisplay,
        acquisitionChannelId: parsedInput.acquisitionChannelId
      });

      return {
        customer: toStaffCustomerView(result.customer),
        isNewCustomer: result.isNewCustomer
      };
    }
  };
}
