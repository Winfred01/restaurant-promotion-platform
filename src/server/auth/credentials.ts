import { UserStatus } from "@prisma/client";
import { z } from "zod";

import { verifyPassword } from "@/server/auth/passwords";

export function normalizeEmployeeEmail(email: string) {
  return email.trim().toLowerCase();
}

const employeeCredentialsSchema = z.object({
  email: z.string().transform(normalizeEmployeeEmail).pipe(z.string().email()),
  password: z.string().min(1)
});

export type EmployeeSessionUser = {
  id: string;
  email: string;
  name: string;
};

export type EmployeeAuthUserRecord = EmployeeSessionUser & {
  passwordHash: string;
  status: UserStatus;
};

export type EmployeeAuthUserLookup = {
  user: {
    findUnique: (args: {
      where: {
        email: string;
      };
      select: {
        id: true;
        email: true;
        name: true;
        passwordHash: true;
        status: true;
      };
    }) => Promise<EmployeeAuthUserRecord | null>;
  };
};

export async function validateEmployeeCredentials(
  db: EmployeeAuthUserLookup,
  input: unknown
): Promise<EmployeeSessionUser | null> {
  const parsed = employeeCredentialsSchema.safeParse(input);

  if (!parsed.success) {
    return null;
  }

  const user = await db.user.findUnique({
    where: {
      email: parsed.data.email
    },
    select: {
      id: true,
      email: true,
      name: true,
      passwordHash: true,
      status: true
    }
  });

  if (!user || user.status !== UserStatus.ACTIVE) {
    return null;
  }

  const passwordMatches = await verifyPassword(user.passwordHash, parsed.data.password);

  if (!passwordMatches) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name
  };
}
