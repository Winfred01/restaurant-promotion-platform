import type { EmployeeSessionUser } from "@/server/auth/credentials";

export type EmployeeSession = {
  user: EmployeeSessionUser;
};

export class AuthenticationRequiredError extends Error {
  readonly code = "AUTHENTICATION_REQUIRED";

  constructor() {
    super("Employee authentication is required.");
    this.name = "AuthenticationRequiredError";
  }
}

export async function getCurrentEmployeeSession(): Promise<EmployeeSession | null> {
  const { auth } = await import("@/auth");
  const session = await auth();

  if (!session?.user?.id || !session.user.email || !session.user.name) {
    return null;
  }

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name
    }
  };
}

export async function requireEmployeeSession(
  loadSession: () => Promise<EmployeeSession | null> = getCurrentEmployeeSession
) {
  const session = await loadSession();

  if (!session) {
    throw new AuthenticationRequiredError();
  }

  return session;
}
