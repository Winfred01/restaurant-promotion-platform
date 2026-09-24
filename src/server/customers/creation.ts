import { Prisma, type Customer, type PrismaClient } from "@prisma/client";

import { normalizePhoneNumber } from "./phone";

export type FindOrCreateCustomerInput = {
  organizationId: string;
  phoneNumber: string;
  phoneNumberDisplay?: string;
  acquisitionChannelId?: string;
};

export type CustomerResolution = {
  customer: Customer;
  isNewCustomer: boolean;
};

export class AcquisitionChannelRequiredError extends Error {
  readonly code = "ACQUISITION_CHANNEL_REQUIRED";

  constructor() {
    super("Acquisition channel is required for a new customer.");
    this.name = "AcquisitionChannelRequiredError";
  }
}

export class AcquisitionChannelUnavailableError extends Error {
  readonly code = "ACQUISITION_CHANNEL_UNAVAILABLE";

  constructor() {
    super("Acquisition channel is unavailable.");
    this.name = "AcquisitionChannelUnavailableError";
  }
}

function findCustomer(
  db: Prisma.TransactionClient | PrismaClient,
  organizationId: string,
  phoneNumberNormalized: string
) {
  return db.customer.findUnique({
    where: {
      organizationId_phoneNumberNormalized: {
        organizationId,
        phoneNumberNormalized
      }
    }
  });
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function findOrCreateCustomer(
  db: PrismaClient,
  input: FindOrCreateCustomerInput
): Promise<CustomerResolution> {
  const phoneNumberNormalized = normalizePhoneNumber(input.phoneNumber);

  try {
    return await db.$transaction(async (transaction) => {
      const existingCustomer = await findCustomer(
        transaction,
        input.organizationId,
        phoneNumberNormalized
      );

      if (existingCustomer) {
        return {
          customer: existingCustomer,
          isNewCustomer: false
        };
      }

      if (!input.acquisitionChannelId) {
        throw new AcquisitionChannelRequiredError();
      }

      const acquisitionChannel = await transaction.acquisitionChannel.findFirst({
        where: {
          id: input.acquisitionChannelId,
          organizationId: input.organizationId,
          status: "ACTIVE"
        },
        select: {
          id: true
        }
      });

      if (!acquisitionChannel) {
        throw new AcquisitionChannelUnavailableError();
      }

      const customer = await transaction.customer.create({
        data: {
          organizationId: input.organizationId,
          acquisitionChannelId: acquisitionChannel.id,
          phoneNumberRaw: input.phoneNumber.trim(),
          phoneNumberNormalized,
          phoneNumberDisplay: input.phoneNumberDisplay?.trim() || phoneNumberNormalized
        }
      });

      return {
        customer,
        isNewCustomer: true
      };
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const concurrentCustomer = await findCustomer(db, input.organizationId, phoneNumberNormalized);

    if (!concurrentCustomer) {
      throw error;
    }

    return {
      customer: concurrentCustomer,
      isNewCustomer: false
    };
  }
}
