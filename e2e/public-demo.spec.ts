import { expect, test, type Page } from "@playwright/test";

async function enter(page: Page, role: "Owner" | "Manager" | "Staff") {
  await page.getByRole("button", { name: `Enter as ${role}` }).click();
  await expect(page).toHaveURL(/\/app\/?$/);
  await expect(page.getByText(`Signed in as Demo ${role}`)).toBeVisible();
}

async function downtown(page: Page) {
  await page.getByRole("link", { name: /Downtown Demo/ }).click();
  await expect(page).toHaveURL(/\/app\/[^/]+\/[^/]+\/?$/);
  return new URL(page.url()).pathname;
}

async function prepareCheckout(page: Page, receipt: string, offer: RegExp) {
  await page.getByLabel("Phone number").fill("4165550103");
  await page.getByRole("button", { name: "Find customer" }).click();
  const wizard = page.getByRole("dialog", { name: "Promotion checkout" });
  await expect(wizard.getByText("Returning customer found")).toBeVisible();
  await wizard.getByRole("button", { name: "Continue to bill" }).click();
  await wizard.getByLabel("Bill subtotal ($)").fill("40.00");
  await wizard.getByLabel("Receipt number").fill(receipt);
  await wizard.getByRole("button", { name: "Show offers" }).click();
  await wizard.getByRole("radio", { name: offer }).check();
  await wizard.getByRole("button", { name: "Review redemption" }).click();
  await expect(wizard.getByRole("heading", { name: /Step 4 of 4/ })).toBeVisible();
  return wizard;
}

test("visitor roles, mobile checkout, and persistent duplicate protection", async ({ page }) => {
  test.setTimeout(120_000);
  const landing = await page.goto("/");
  expect(landing?.status()).toBe(200);
  expect(landing?.headers()["x-content-type-options"]).toBe("nosniff");
  await page.goto("/app");
  await expect(page).toHaveURL(/\/demo\/?$/);
  await expect(page.getByRole("heading", { name: "Choose a branch" })).toHaveCount(0);
  for (const path of ["/api/demo/seed", "/api/demo/reset"]) {
    expect((await page.request.post(path)).status()).toBe(404);
  }
  await page.goto("/");
  await page.getByRole("link", { name: "Try Live Demo" }).click();
  await enter(page, "Owner");
  await expect(page.getByRole("link", { name: /Riverside Demo/ })).toBeVisible();
  const ownerBranch = await downtown(page);
  await page.getByRole("link", { name: "Organization dashboard" }).click();
  await expect(page.getByRole("heading", { name: "Restaurant performance" })).toBeVisible();

  if (process.env.DEMO_SMOKE_BASE_URL) {
    expect(new URL(page.url()).origin).toBe(new URL(process.env.DEMO_SMOKE_BASE_URL).origin);
    const session = (await page.context().cookies()).find((cookie) =>
      cookie.name.endsWith("authjs.session-token")
    );
    expect({
      secure: session?.secure,
      httpOnly: session?.httpOnly,
      sameSite: session?.sameSite
    }).toEqual({ secure: true, httpOnly: true, sameSite: "Lax" });
  }

  await page.goto("/demo");
  await enter(page, "Manager");
  await expect(page.getByRole("link", { name: /Riverside Demo/ })).toHaveCount(0);
  const managerBranch = await downtown(page);
  expect(managerBranch.split("/")[2]).not.toBe(ownerBranch.split("/")[2]);
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("link", { name: "Promotions", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Welcome $5 off" })).toBeVisible();
  await page.goto(`${managerBranch}/manager/redemptions`);
  await expect(page.getByRole("heading", { name: "Redemption history" })).toBeVisible();
  await expect(page.getByText("DEMO-VOID-01")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo");
  await enter(page, "Staff");
  const staffBranch = await downtown(page);
  expect(staffBranch.split("/")[2]).not.toBe(managerBranch.split("/")[2]);
  await page.goto(ownerBranch);
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  await page.goto(`${staffBranch}/manager/redemptions`);
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  await page.goto(`${staffBranch}/checkout`);

  const lookupPath = "/api/staff/customers";
  const legacy = await page.request.get(lookupPath);
  expect(legacy.status()).toBe(405);
  expect(legacy.headers().allow).toBe("POST");
  const [, , organizationId, branchId] = staffBranch.split("/");
  const origin = new URL(page.url()).origin;
  const lookup = {
    action: "lookup",
    organizationId,
    branchId,
    phoneNumber: "5550001234"
  };
  const rejected = await page.request.post(lookupPath, { headers: { origin }, data: lookup });
  expect(rejected.status()).toBe(400);
  expect(await rejected.json()).toMatchObject({ error: { code: "INVALID_PHONE_NUMBER" } });
  const crossOrigin = await page.request.post(lookupPath, {
    headers: { origin: "https://example.invalid" },
    data: lookup
  });
  expect(crossOrigin.status()).toBe(403);

  const receipt = "PUBLIC-DEMO-SMOKE-01";
  const lookupRequest = page.waitForRequest(
    (request) => new URL(request.url()).pathname === lookupPath
  );
  const wizard = await prepareCheckout(page, receipt, /Welcome \$5 off.*Best Deal/);
  const lookupSent = await lookupRequest;
  expect(lookupSent.method()).toBe("POST");
  expect(new URL(lookupSent.url()).search).toBe("");
  await expect(wizard.getByText("$35.00", { exact: true })).toBeVisible();
  const box = (await wizard.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);

  await wizard.getByRole("button", { name: "Confirm redemption", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Redemption completed" })).toBeVisible();
  await expect(wizard).toBeHidden();
  await expect(page.getByLabel("Phone number")).toBeEmpty();
  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).some((key) => key.startsWith("staff-checkout:"))
    )
  ).toBe(false);

  await page.reload();
  await expect(wizard).toBeHidden();
  await expect(page.getByLabel("Phone number")).toBeEmpty();
  await prepareCheckout(page, receipt.toLowerCase(), /Downtown weeknight 10%/);
  await wizard.getByRole("button", { name: "Confirm redemption", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "Receipt already used" })).toBeVisible();
});
