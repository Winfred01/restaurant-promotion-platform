import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { prisma } from "@/server/db";
import { validateEmployeeCredentials } from "@/server/auth/credentials";
import { consumeDemoTicket, isGuidedDemoEnabled } from "@/server/demo/entry";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      authorize: async (credentials) => validateEmployeeCredentials(prisma, credentials)
    }),
    Credentials({
      id: "guided-demo",
      name: "Guided demo",
      credentials: { ticket: { label: "Demo ticket", type: "text" } },
      authorize: async (credentials) => {
        if (!isGuidedDemoEnabled()) return null;
        return consumeDemoTicket(prisma, credentials.ticket);
      }
    })
  ],
  session: {
    strategy: "jwt"
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.employeeUserId = user.id;
        token.demoLeaseId = typeof user.demoLeaseId === "string" ? user.demoLeaseId : undefined;
        token.demoExpiresAt = token.demoLeaseId ? Date.now() + 2 * 60 * 60 * 1000 : undefined;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        const employeeUserId =
          typeof token.employeeUserId === "string" ? token.employeeUserId : token.sub;
        session.user.id = employeeUserId ?? "";
        session.user.demoLeaseId =
          typeof token.demoLeaseId === "string" ? token.demoLeaseId : undefined;
        session.user.demoExpiresAt =
          typeof token.demoExpiresAt === "number" ? token.demoExpiresAt : undefined;
      }

      return session;
    }
  }
});
