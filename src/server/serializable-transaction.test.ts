import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SERIALIZABLE_TRANSACTION_ATTEMPTS,
  retrySerializableTransaction
} from "./serializable-transaction";

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError("Database operation failed", {
    code,
    clientVersion: Prisma.prismaVersion.client
  });
}

describe("retrySerializableTransaction", () => {
  it("retries a transient serialization conflict as a complete operation", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(prismaError("P2034"))
      .mockResolvedValue("completed");

    await expect(retrySerializableTransaction(operation)).resolves.toBe("completed");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not retry uniqueness or unrelated failures", async () => {
    const uniquenessOperation = vi
      .fn<() => Promise<never>>()
      .mockRejectedValue(prismaError("P2002"));
    const unrelatedError = new Error("Unavailable");
    const unrelatedOperation = vi.fn<() => Promise<never>>().mockRejectedValue(unrelatedError);

    await expect(retrySerializableTransaction(uniquenessOperation)).rejects.toMatchObject({
      code: "P2002"
    });
    await expect(retrySerializableTransaction(unrelatedOperation)).rejects.toBe(unrelatedError);
    expect(uniquenessOperation).toHaveBeenCalledTimes(1);
    expect(unrelatedOperation).toHaveBeenCalledTimes(1);
  });

  it("stops after the bounded serialization retry budget", async () => {
    const operation = vi.fn<() => Promise<never>>().mockRejectedValue(prismaError("P2034"));

    await expect(retrySerializableTransaction(operation)).rejects.toMatchObject({ code: "P2034" });
    expect(operation).toHaveBeenCalledTimes(DEFAULT_SERIALIZABLE_TRANSACTION_ATTEMPTS);
  });

  it("rejects an invalid retry budget", async () => {
    await expect(retrySerializableTransaction(async () => "unused", 0)).rejects.toBeInstanceOf(
      RangeError
    );
  });
});
