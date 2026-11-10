import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, role: "staff" | "manager" = "staff") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(role + "@restaurant-demo.example.com");
  await page.getByLabel("Password").fill(process.env.E2E_DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app\/?$/);
}

async function openCheckout(page: Page) {
  await signIn(page);
  await page.getByRole("link", { name: /Downtown Demo/ }).click();
  await page.getByRole("link", { name: "Staff checkout", exact: true }).click();
  const wizard = page.getByRole("dialog", { name: "Promotion checkout" });
  await expect(wizard).toBeHidden();
  await expect(page.getByLabel("Bill subtotal ($)")).toBeHidden();
  await page.getByLabel("Phone number").fill("4165550103");
  await page.getByRole("button", { name: "Find customer" }).click();
  await expect(wizard.getByText("Returning customer found")).toBeVisible();
  await expect(wizard.getByLabel("Acquisition channel")).toBeHidden();
  return wizard;
}

test("backdrop, keyboard, step edits and refresh preserve a revalidated draft", async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let quotes = 0;
  let redeems = 0;
  let lookups = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/staff/customers")) {
      expect(new URL(request.url()).search).toBe("");
      if (request.postDataJSON().action === "lookup") lookups++;
    }
    if (!request.url().endsWith("/api/staff/checkout")) return;
    const action = request.postDataJSON().action;
    if (action === "quote") quotes++;
    if (action === "redeem") redeems++;
  });

  const wizard = await openCheckout(page);
  const customerHeading = wizard.getByRole("heading", { name: /Confirm customer/ });
  await expect(customerHeading).toBeFocused();
  await expect(wizard.locator('[aria-current="step"]')).toContainText("Customer");
  const bounds = (await wizard.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await page.mouse.click(1, 1);
  await expect(wizard).toBeVisible();
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press("Tab");
    expect(await wizard.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  }

  await wizard.getByRole("button", { name: "Continue to bill" }).focus();
  await page.keyboard.press("Enter");
  const billHeading = wizard.getByRole("heading", { name: /Enter bill/ });
  await expect(billHeading).toBeFocused();
  await wizard.getByLabel("Bill subtotal ($)").fill("40.001");
  await wizard.getByLabel("Receipt number").fill("WIZARD-75");
  await wizard.getByRole("button", { name: "Show offers" }).click();
  await expect(wizard.getByRole("alert")).toContainText("up to two decimal places");
  expect(quotes).toBe(0);
  await wizard.getByLabel("Bill subtotal ($)").fill("40.00");
  await wizard.getByRole("button", { name: "Show offers" }).click();
  const choice = wizard.getByRole("radio", { name: /Best Deal/ });
  await choice.check();
  await wizard.getByRole("button", { name: "Review redemption" }).click();
  await expect(wizard.getByRole("heading", { name: /Step 4 of 4/ })).toBeFocused();
  await expect(wizard.getByText("WIZARD-75")).toBeVisible();
  await expect(wizard.getByText("Ending in 0103")).toBeVisible();

  await wizard.getByRole("button", { name: /Enter bill.*completed/ }).click();
  await expect(billHeading).toBeFocused();
  await wizard.getByLabel("Bill subtotal ($)").fill("45.00");
  await expect(wizard.getByLabel("Receipt number")).toHaveValue("WIZARD-75");
  await wizard.getByRole("button", { name: "Show offers" }).click();
  await expect(choice).toBeChecked();
  expect(quotes).toBe(2);
  await page.reload();
  await expect(wizard.getByRole("heading", { name: /Step 3 of 4/ })).toBeVisible();
  await expect(choice).toBeChecked();
  expect(quotes).toBe(3);
  await wizard.getByRole("button", { name: "Review redemption" }).click();
  await expect(wizard.getByText("$45.00", { exact: true })).toBeVisible();
  await expect(wizard.getByText("$40.00", { exact: true })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(wizard).toBeHidden();
  await expect(page.getByLabel("Phone number")).toBeFocused();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  await page.getByRole("button", { name: "Find customer" }).click();
  await expect(wizard.getByRole("heading", { name: /Step 4 of 4/ })).toBeFocused();
  expect(quotes).toBe(4);
  await page.reload();
  await expect(wizard.getByRole("heading", { name: /Step 4 of 4/ })).toBeVisible();
  await expect(wizard.getByText("WIZARD-75")).toBeVisible();
  await expect(wizard.getByText("$40.00", { exact: true })).toBeVisible();
  expect(quotes).toBe(5);
  expect(lookups).toBe(4);

  await wizard.getByRole("button", { name: /Enter bill.*completed/ }).click();
  await wizard.getByLabel("Receipt number").fill("CORRECTED-76");
  await wizard.getByRole("button", { name: "Show offers" }).click();
  await expect(choice).toBeChecked();
  expect(quotes).toBe(6);
  await wizard.getByRole("radio", { name: /Downtown weeknight 10%/ }).check();
  await wizard.getByRole("button", { name: "Review redemption" }).click();
  await expect(wizard.getByText("$40.50", { exact: true })).toBeVisible();

  await wizard.getByRole("button", { name: /Confirm customer.*completed/ }).click();
  await wizard.getByRole("button", { name: "Change phone" }).click();
  await page.getByLabel("Phone number").fill("4165550104");
  await page.getByRole("button", { name: "Find customer" }).click();
  await expect(wizard.getByText("Phone ending in 0104")).toBeVisible();
  await wizard.getByRole("button", { name: "Continue to bill" }).click();
  await expect(wizard.getByLabel("Bill subtotal ($)")).toHaveValue("45.00");
  await expect(wizard.getByLabel("Receipt number")).toHaveValue("CORRECTED-76");
  await wizard.getByRole("button", { name: "Show offers" }).click();
  await expect(wizard.getByRole("radio", { name: /Downtown weeknight 10%/ })).not.toBeChecked();
  await expect(wizard.getByRole("button", { name: "Review redemption" })).toBeDisabled();
  expect(quotes).toBe(7);
  expect(lookups).toBe(5);
  expect(redeems).toBe(0);
});

test("reopens an unsubmitted new-customer draft without creating a customer", async ({ page }) => {
  let creations = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url().endsWith("/api/staff/customers") &&
      request.postDataJSON().action !== "lookup"
    )
      creations++;
  });
  const wizard = await openCheckout(page);
  await wizard.getByRole("button", { name: "Change phone" }).click();
  await page.getByLabel("Phone number").fill("4165550196");
  await page.getByRole("button", { name: "Find customer" }).click();
  const channel = wizard.getByLabel("Acquisition channel");
  await channel.selectOption({ label: "Walk-in" });
  const selectedChannel = await channel.inputValue();
  await wizard.getByRole("button", { name: "Close and keep draft" }).click();
  await expect(wizard).toBeHidden();
  await page.reload();
  await expect(wizard.getByText("New customer", { exact: true })).toBeVisible();
  await expect(channel).toHaveValue(selectedChannel);
  expect(creations).toBe(0);
  await wizard.getByRole("button", { name: "Start over" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Clear draft and start over" })
    .click();
  await expect(wizard).toBeHidden();
  await expect(page.getByLabel("Phone number")).toBeEmpty();
});

test("expires the open wizard and discards stale, corrupt and unsupported storage on reload", async ({
  page
}) => {
  await page.clock.install();
  const wizard = await openCheckout(page);
  await wizard.getByRole("button", { name: "Continue to bill" }).click();
  await wizard.getByLabel("Receipt number").fill("EXPIRES-76");
  const saved = await page.evaluate(() => {
    const key = Object.keys(sessionStorage).find((key) => key.startsWith("staff-checkout:v1:"))!;
    return { key, value: sessionStorage.getItem(key)! };
  });

  await page.clock.fastForward(30 * 60 * 1000);
  await expect(wizard).toBeHidden();
  await expect(page.getByLabel("Phone number")).toBeEmpty();
  await expect(page.getByText("The checkout draft expired.")).toBeVisible();
  expect(await page.evaluate((key) => sessionStorage.getItem(key), saved.key)).toBeNull();

  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/staff/")) requests.push(request.url());
  });
  await page.evaluate(({ key, value }) => {
    sessionStorage.setItem(key, value);
    sessionStorage.setItem("staff-checkout:v1:corrupt", "{");
    sessionStorage.setItem("staff-checkout:v0:retired", value);
  }, saved);
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(sessionStorage).filter((key) => key.startsWith("staff-checkout:"))
      )
    )
    .toEqual([]);
  await expect(wizard).toBeHidden();
  await expect(page.getByLabel("Phone number")).toBeEmpty();
  expect(requests).toEqual([]);
});

test("blocked storage leaves checkout editable and prevents an untracked redemption", async ({
  page
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "sessionStorage", {
      get() {
        throw new DOMException("Storage blocked", "SecurityError");
      }
    });
  });
  const wizard = await openCheckout(page);
  await wizard.getByRole("button", { name: "Continue to bill" }).click();
  await wizard.getByLabel("Bill subtotal ($)").fill("40.00");
  await wizard.getByLabel("Receipt number").fill("STORAGE-BLOCKED-76");
  await wizard.getByRole("button", { name: "Show offers" }).click();
  await wizard.getByRole("radio", { name: /Best Deal/ }).check();
  await wizard.getByRole("button", { name: "Review redemption" }).click();
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/staff/checkout")) requests.push(request.postDataJSON().action);
  });
  await wizard.getByRole("button", { name: "Confirm redemption", exact: true }).click();
  await expect(wizard.getByRole("alert")).toContainText("Enable tab storage");
  await expect(wizard.getByText("STORAGE-BLOCKED-76")).toBeVisible();
  expect(requests).toEqual([]);
});

test("branch switching isolates drafts and same-tab sign-out erases all checkout scopes", async ({
  page
}) => {
  const wizard = await openCheckout(page);
  const downtown = page.url();
  await wizard.getByRole("button", { name: "Continue to bill" }).click();
  await wizard.getByLabel("Receipt number").fill("STAFF-DOWNTOWN-76");
  await wizard.getByRole("button", { name: "Close and keep draft" }).click();
  await page.getByRole("link", { name: "Change branch" }).click();
  await page.getByRole("link", { name: /Riverside Demo/ }).click();
  await page.getByRole("link", { name: "Staff checkout", exact: true }).click();
  await expect(page.getByLabel("Phone number")).toBeEmpty();
  await expect(wizard).toBeHidden();
  await page.getByLabel("Phone number").fill("4165550104");
  await page.getByRole("button", { name: "Find customer" }).click();
  await wizard.getByRole("button", { name: "Continue to bill" }).click();
  await expect(wizard.getByLabel("Receipt number")).toBeEmpty();
  await wizard.getByLabel("Receipt number").fill("STAFF-RIVERSIDE-76");
  await page.goto(downtown);
  await expect(wizard.getByLabel("Receipt number")).toHaveValue("STAFF-DOWNTOWN-76");
  await wizard.getByRole("button", { name: "Close and keep draft" }).click();
  await page.evaluate(() => sessionStorage.setItem("other-app-state", "keep"));
  const drafts = () =>
    page.evaluate(() =>
      Object.keys(sessionStorage).filter((key) => key.startsWith("staff-checkout:"))
    );
  expect(await drafts()).toHaveLength(2);

  // Assert before the login page mounts, so its defensive cleanup cannot mask a broken logout.
  let clearedAtSignOut: string[] | undefined;
  await page.route(downtown, async (route) => {
    if (route.request().headers()["next-action"]) clearedAtSignOut = await drafts();
    await route.continue();
  });
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(clearedAtSignOut).toEqual([]);
  await signIn(page, "manager");
  await page.goto(downtown);
  await expect(wizard).toBeHidden();
  await expect(page.getByLabel("Phone number")).toBeEmpty();
  expect(await drafts()).toEqual([]);
  expect(await page.evaluate(() => sessionStorage.getItem("other-app-state"))).toBe("keep");
});

for (const failure of [
  {
    code: "CHECKOUT_CONTEXT_CHANGED",
    title: "Checkout details changed",
    message: "Get an updated quote"
  },
  {
    code: "REDEMPTION_CONFLICT",
    title: "Redemption conflict",
    message: "The exact cause could not be verified"
  }
]) {
  test("recovers from " + failure.code + " without replay", async ({ page }) => {
    let attempts = 0;
    await page.route("**/api/staff/checkout", async (route) => {
      if (route.request().postDataJSON().action === "quote") return route.continue();
      attempts++;
      await route.fulfill({ status: 409, json: { error: { code: failure.code } } });
    });
    const wizard = await openCheckout(page);
    await wizard.getByRole("button", { name: "Continue to bill" }).click();
    await wizard.getByLabel("Bill subtotal ($)").fill("40.00");
    await wizard.getByLabel("Receipt number").fill("KEEP-75");
    await wizard.getByRole("button", { name: "Show offers" }).click();
    const choice = wizard.getByRole("radio", { name: /Best Deal/ });
    await choice.check();
    await wizard.getByRole("button", { name: "Review redemption" }).click();
    await wizard.getByRole("button", { name: "Confirm redemption", exact: true }).click();
    const dialog = page.getByRole("alertdialog", { name: failure.title });
    await expect(dialog).toContainText(failure.message);
    await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(wizard.getByRole("heading", { name: /Step 3 of 4/ })).toBeFocused();
    await wizard.getByRole("button", { name: "Refresh offers" }).click();
    await expect(choice).toBeChecked();
    await wizard.getByRole("button", { name: "Review redemption" }).click();
    await expect(wizard.getByText("KEEP-75")).toBeVisible();
    await expect(wizard.getByText("$40.00", { exact: true })).toBeVisible();
    await expect(wizard.getByText("Ending in 0103")).toBeVisible();
    expect(attempts).toBe(1);
  });
}
