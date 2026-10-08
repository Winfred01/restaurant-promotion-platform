import { redirect } from "next/navigation";

import { getCurrentEmployeeSession } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await getCurrentEmployeeSession();

  if (session) {
    redirect("/app");
  }

  return <LoginForm showDemoAccounts={process.env.DEMO_LOGIN_ENABLED === "1"} />;
}
