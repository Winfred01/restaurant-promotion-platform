import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      demoLeaseId?: string;
      demoExpiresAt?: number;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    email: string;
    name: string;
    demoLeaseId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    employeeUserId?: string;
    demoLeaseId?: string;
    demoExpiresAt?: number;
  }
}
