import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { prisma } from "@/server/db";
import { validateEmployeeCredentials } from "@/server/auth/credentials";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      authorize: async (credentials) => validateEmployeeCredentials(prisma, credentials)
    })
  ],
  session: {
    strategy: "jwt"
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.employeeUserId = user.id;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        const employeeUserId =
          typeof token.employeeUserId === "string" ? token.employeeUserId : token.sub;
        session.user.id = employeeUserId ?? "";
      }

      return session;
    }
  }
});
