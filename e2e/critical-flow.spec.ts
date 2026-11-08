import { expect, test, type Browser, type Page } from "@playwright/test";

const password = process.env.E2E_DEMO_PASSWORD;
if (!password) throw new Error("E2E_DEMO_PASSWORD is required for the seeded demo database.");

async function signIn(browser: Browser, role: "owner" | "manager" | "staff") {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(`${role}@restaurant-demo.example.com`);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app\/?$/);
  await page.getByRole("link", { name: /Downtown Demo/ }).click();
  await expect(page).toHaveURL(/\/app\/[^/]+\/[^/]+\/?$/);
  return { context, page, branchPath: new URL(page.url()).pathname };
}

async function lookup(page: Page, phone: string) {
  await page.getByLabel("Phone number").fill(phone);
  await page.getByRole("button", { name: "Find customer" }).click();
}

test("seeded Owner, Manager, and Staff complete the business loop with enforced permissions", async ({
  browser
}) => {
  const owner = await signIn(browser, "owner");
  await owner.page.getByRole("link", { name: "Organization dashboard" }).click();
  await expect(owner.page.getByRole("heading", { name: "Restaurant performance" })).toBeVisible();
  await owner.context.close();

  const manager = await signIn(browser, "manager");
  const branchPath = manager.branchPath;
  await manager.page.getByRole("link", { name: "Promotions", exact: true }).click();
  const create = manager.page
    .getByRole("heading", { name: "Create promotion" })
    .locator("..", { has: manager.page.locator("form") });
  await create.getByLabel("Name").fill("E2E twenty percent");
  await create.getByLabel("Reward type").selectOption("PERCENTAGE");
  await create.getByLabel("Discount (%)").fill("20");
  await create.getByRole("button", { name: "Create draft" }).click();
  const promotion = manager.page.locator("article", {
    has: manager.page.getByRole("heading", { name: "E2E twenty percent" })
  });
  await expect(promotion).toContainText("DRAFT");
  await promotion.getByRole("button", { name: "Activate" }).click();
  await expect(promotion).toContainText("ACTIVE");

  const staff = await signIn(browser, "staff");
  await expect(staff.page.getByRole("link", { name: "Organization dashboard" })).toHaveCount(0);
  await staff.page.goto(`${branchPath}/manager/redemptions`);
  await expect(staff.page.getByRole("heading", { name: "404" })).toBeVisible();
  await staff.page.goto(`${branchPath}/checkout`);
  await lookup(staff.page, "4165550198");
  await expect(staff.page.getByText("New customer", { exact: true })).toBeVisible();
  await staff.page.getByLabel("Acquisition channel").selectOption({ label: "Walk-in" });
  await staff.page.getByRole("button", { name: "Create customer" }).click();
  await expect(staff.page.getByText(/New customer created/)).toBeVisible();
  await lookup(staff.page, "4165550198");
  await expect(staff.page.getByText(/Returning customer found/)).toBeVisible();
  await expect(staff.page.getByLabel("Acquisition channel")).toHaveCount(0);
  await staff.page.getByLabel("Bill subtotal ($)").fill("40.00");
  await staff.page.getByLabel("Receipt number").fill("E2E-24-001");
  await staff.page.getByRole("button", { name: "Show offers" }).click();
  const best = staff.page.getByRole("radio", { name: /E2E twenty percent.*Best Deal/ });
  await expect(best).toBeEnabled();
  await best.check();
  await staff.page.getByRole("button", { name: "Confirm one redemption" }).click();
  await expect(
    staff.page.getByRole("status").filter({ hasText: "Redemption completed" })
  ).toContainText("$8.00 discount");

  await lookup(staff.page, "4165550199");
  await staff.page.getByLabel("Acquisition channel").selectOption({ label: "Friend referral" });
  await staff.page.getByRole("button", { name: "Create customer" }).click();
  await staff.page.getByLabel("Bill subtotal ($)").fill("40.00");
  await staff.page.getByRole("button", { name: "Show offers" }).click();
  await staff.page.getByRole("radio", { name: /E2E twenty percent/ }).check();
  await staff.page.getByRole("button", { name: "Confirm one redemption" }).click();
  await expect(
    staff.page.getByRole("alert").filter({ hasText: /receipt|already|conflict/i })
  ).toBeVisible();
  await staff.context.close();

  await manager.page.goto(`${branchPath}/manager`);
  await expect(
    manager.page
      .getByRole("heading", { name: "Promotion-linked sales" })
      .locator("..", { hasText: "$93.00" })
  ).toBeVisible();
  await manager.page.goto(`${branchPath}/manager/redemptions`);
  const redemption = manager.page.locator("article", { hasText: "E2E-24-001" });
  await redemption.getByLabel("Reason for void").fill("E2E correction");
  await redemption.getByRole("checkbox").check();
  await redemption.getByRole("button", { name: "Void redemption" }).click();
  await expect(redemption).toContainText("VOIDED");
  await manager.page.goto(`${branchPath}/manager`);
  await expect(
    manager.page
      .getByRole("heading", { name: "Promotion-linked sales" })
      .locator("..", { hasText: "$61.00" })
  ).toBeVisible();
  await manager.context.close();
});
