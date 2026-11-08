import { spawnSync } from "node:child_process";

import { expect, test, type Browser } from "@playwright/test";

async function enterDemo(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto("/demo");
  await page.getByRole("button", { name: "Enter as Staff" }).click();
  await expect(page).toHaveURL(/\/app\/?$/);
  await page.getByRole("link", { name: /Downtown Demo/ }).click();
  await expect(page).toHaveURL(/\/app\/[^/]+\/[^/]+\/?$/);
  await expect(page.getByText("Isolated demo session").first()).toBeVisible();
  return { context, page, branchPath: new URL(page.url()).pathname };
}

test("guided visitors receive separate tenants and mobile Staff access stays scoped", async ({
  browser
}) => {
  const first = await enterDemo(browser);
  const second = await enterDemo(browser);
  expect(first.branchPath.split("/")[2]).not.toBe(second.branchPath.split("/")[2]);

  await first.page.goto(second.branchPath);
  await expect(first.page.getByRole("heading", { name: "404" })).toBeVisible();
  const foreignQuote = await first.page.request.post("/api/staff/checkout", {
    headers: { origin: new URL(first.page.url()).origin },
    data: {
      action: "quote",
      organizationId: second.branchPath.split("/")[2],
      branchId: second.branchPath.split("/")[3],
      customerId: "foreign-customer",
      billSubtotalCents: 4000
    }
  });
  expect(foreignQuote.status()).toBe(403);

  await second.page.goto(`${second.branchPath}/checkout`);
  await second.page.getByLabel("Phone number").fill("4165550103");
  await second.page.getByRole("button", { name: "Find customer" }).click();
  await expect(second.page.getByText(/Returning customer found/)).toBeVisible();
  await expect(second.page.getByLabel("Acquisition channel")).toHaveCount(0);
  await second.page.getByLabel("Bill subtotal ($)").fill("40.00");
  await second.page.getByLabel("Receipt number").fill("E2E-MOBILE-01");
  await second.page.getByRole("button", { name: "Show offers" }).click();
  await expect(second.page.getByText("Best Deal", { exact: true })).toBeVisible();
  expect(await second.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true
  );

  const cookies = await second.context.cookies();
  const session = cookies.find((cookie) => cookie.name.endsWith("session-token"));
  expect(session).toMatchObject({ httpOnly: true, sameSite: "Lax" });
  await first.context.close();
  await second.context.close();
});

test("public QR claims give indistinguishable valid responses and reject cross-origin requests", async ({
  browser
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill("manager@restaurant-demo.example.com");
  await page.getByLabel("Password").fill(process.env.E2E_DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: /Downtown Demo/ }).click();
  await page.getByRole("link", { name: "Promotions", exact: true }).click();
  const welcome = page.locator("article", {
    has: page.getByRole("heading", { name: "Welcome $5 off" })
  });
  const href = await welcome
    .getByRole("link", { name: "Open public claim page for this branch" })
    .getAttribute("href");
  expect(href).toBeTruthy();
  const [, , organizationId, branchId, promotionId] = href!.split("/");
  await page.goto(href!);
  await expect(page.getByLabel("Phone number")).toBeVisible();

  const requestOrigin = new URL(page.url()).origin;
  const post = (phoneNumber: string, origin = requestOrigin) =>
    page.request.post(`${requestOrigin}/api/public/claims`, {
      headers: { origin },
      data: { organizationId, branchId, promotionId, phoneNumber }
    });
  const known = await post("4165550103");
  const unknown = await post("4165550197");
  expect(known.status()).toBe(202);
  expect(unknown.status()).toBe(202);
  expect(await known.json()).toEqual(await unknown.json());
  expect(known.headers()["cache-control"]).toBe("no-store");
  for (let i = 0; i < 3; i += 1) {
    const limited = await post("4165550103");
    expect(limited.status()).toBe(202);
    expect(await limited.json()).toEqual(await known.json());
  }
  expect((await post("4165550103", "https://attacker.example")).status()).toBe(403);
  await context.close();
});

test("production rejects the operator seed before connecting to PostgreSQL", () => {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/seed-demo.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "production",
        DEMO_SEED_CONFIRM: "restaurant-demo",
        DEMO_SEED_DATABASE: "restaurant_promotion_demo",
        DEMO_SEED_PASSWORD: "ephemeral-test-password",
        DATABASE_URL: "postgresql://localhost:1/restaurant_promotion_demo?schema=public"
      },
      encoding: "utf8"
    }
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Demo seeding requires an explicit non-production confirmation.");
});

test("demo seed and reset are not exposed as HTTP routes", async ({ request }) => {
  for (const path of ["/api/demo/seed", "/api/demo/reset"]) {
    const response = await request.post(path);
    expect(response.status()).toBe(404);
  }
});

test("employee login uses the same error for unknown accounts and wrong passwords", async ({
  page
}) => {
  await page.goto("/login");
  const errors: string[] = [];
  for (const email of [
    "unknown@restaurant-demo.example.com",
    "staff@restaurant-demo.example.com"
  ]) {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("incorrect-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    errors.push(
      (await page
        .getByRole("alert")
        .filter({ hasText: /could not sign you in/ })
        .textContent()) ?? ""
    );
  }
  expect(errors[0]).toBe(errors[1]);
});

test("public pages send defensive response headers", async ({ request }) => {
  const response = await request.get("/");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
});
