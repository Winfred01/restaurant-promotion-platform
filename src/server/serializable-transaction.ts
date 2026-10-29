import { Prisma, type PrismaClient } from "@prisma/client";

export const DEFAULT_SERIALIZABLE_TRANSACTION_ATTEMPTS = 3;

export function isPrismaKnownRequestErrorCode(error: unknown, code: string) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

export async function retrySerializableTransaction<T>(
  operation: () => Promise<T>,
  maxAttempts = DEFAULT_SERIALIZABLE_TRANSACTION_ATTEMPTS
) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError("maxAttempts must be a positive integer.");
  }

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isPrismaKnownRequestErrorCode(error, "P2034") || attempt >= maxAttempts) {
        throw error;
      }
    }
  }
}

type InteractiveTransactionOptions = {
  isolationLevel?: Prisma.TransactionIsolationLevel;
  maxWait?: number;
  timeout?: number;
};

export function createRetryingTransactionClient(
  db: PrismaClient,
  maxAttempts = DEFAULT_SERIALIZABLE_TRANSACTION_ATTEMPTS
) {
  return {
    $transaction<T>(
      operation: (transaction: Prisma.TransactionClient) => Promise<T>,
      options?: InteractiveTransactionOptions
    ) {
      return retrySerializableTransaction(() => db.$transaction(operation, options), maxAttempts);
    }
  };
}
