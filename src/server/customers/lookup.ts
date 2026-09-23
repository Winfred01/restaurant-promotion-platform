import type { Prisma, PrismaClient } from "@prisma/client";

import { normalizePhoneNumber } from "./phone";

type CustomerPersistence = PrismaClient | Prisma.TransactionClient;

export type CustomerPhoneLookup = {
  organizationId: string;
  phoneNumber: string;
};

export async function findCustomerByPhoneNumber(
  db: CustomerPersistence,
  input: CustomerPhoneLookup
) {
  const phoneNumberNormalized = normalizePhoneNumber(input.phoneNumber);

  return db.customer.findUnique({
    where: {
      organizationId_phoneNumberNormalized: {
        organizationId: input.organizationId,
        phoneNumberNormalized
      }
    }
  });
}
