import { UserStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  type EmployeeAuthUserLookup,
  normalizeEmployeeEmail,
  validateEmployeeCredentials
} from "@/server/auth/credentials";
import { hashPassword } from "@/server/auth/passwords";

function createLookup(user: Awaited<ReturnType<EmployeeAuthUserLookup["user"]["findUnique"]>>) {
  return {
    user: {
      findUnique: vi.fn(async () => user)
    }
  } satisfies EmployeeAuthUserLookup;
}

describe("employee credentials", () => {
  it("normalizes employee email addresses before lookup", async () => {
    const passwordHash = await hashPassword("correct-password");
    const db = createLookup({
      id: "user_1",
      email: "owner@example.com",
      name: "Owner User",
      passwordHash,
      status: UserStatus.ACTIVE
    });

    await expect(
      validateEmployeeCredentials(db, {
        email: "  OWNER@Example.COM ",
        password: "correct-password"
      })
    ).resolves.toEqual({
      id: "user_1",
      email: "owner@example.com",
      name: "Owner User"
    });

    expect(db.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          email: "owner@example.com"
        }
      })
    );
  });

  it("rejects invalid credentials without a user lookup", async () => {
    const db = createLookup(null);

    await expect(
      validateEmployeeCredentials(db, {
        email: "not-an-email",
        password: "correct-password"
      })
    ).resolves.toBeNull();

    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("rejects wrong passwords and disabled users", async () => {
    const activeDb = createLookup({
      id: "user_1",
      email: "staff@example.com",
      name: "Staff User",
      passwordHash: await hashPassword("correct-password"),
      status: UserStatus.ACTIVE
    });

    await expect(
      validateEmployeeCredentials(activeDb, {
        email: "staff@example.com",
        password: "wrong-password"
      })
    ).resolves.toBeNull();

    const disabledDb = createLookup({
      id: "user_2",
      email: "disabled@example.com",
      name: "Disabled User",
      passwordHash: await hashPassword("correct-password"),
      status: UserStatus.DISABLED
    });

    await expect(
      validateEmployeeCredentials(disabledDb, {
        email: "disabled@example.com",
        password: "correct-password"
      })
    ).resolves.toBeNull();
  });

  it("keeps normalization narrow and predictable", () => {
    expect(normalizeEmployeeEmail(" Manager@Example.COM ")).toBe("manager@example.com");
  });
});
