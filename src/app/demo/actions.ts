"use server";

import { redirect } from "next/navigation";

import { signIn } from "@/auth";
import { prisma } from "@/server/db";
import { claimDemoTenant, isGuidedDemoEnabled, parseDemoRole } from "@/server/demo/entry";

export async function enterGuidedDemo(formData: FormData) {
  if (!isGuidedDemoEnabled()) redirect("/demo?error=disabled");

  const role = parseDemoRole(formData.get("role"));
  if (!role) redirect("/demo?error=role");

  let ticket: string | null;
  try {
    ticket = await claimDemoTenant(prisma, role);
  } catch {
    redirect("/demo?error=unavailable");
  }
  if (!ticket) redirect("/demo?error=full");

  let destination: string;
  try {
    destination = await signIn("guided-demo", { ticket, redirect: false, redirectTo: "/app" });
  } catch {
    redirect("/demo?error=unavailable");
  }
  if (new URL(destination, "http://localhost").pathname !== "/app") {
    redirect("/demo?error=unavailable");
  }
  redirect("/app");
}
