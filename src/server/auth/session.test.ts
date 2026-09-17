import { describe, expect, it } from "vitest";

import {
  AuthenticationRequiredError,
  type EmployeeSession,
  requireEmployeeSession
} from "@/server/auth/session";

describe("employee session helpers", () => {
  it("returns the current employee session from the injected loader", async () => {
    const session: EmployeeSession = {
      user: {
        id: "user_1",
        email: "owner@example.com",
        name: "Owner User"
      }
    };

    await expect(requireEmployeeSession(async () => session)).resolves.toBe(session);
  });

  it("requires employee authentication for protected server requests", async () => {
    await expect(requireEmployeeSession(async () => null)).rejects.toBeInstanceOf(
      AuthenticationRequiredError
    );
  });
});
