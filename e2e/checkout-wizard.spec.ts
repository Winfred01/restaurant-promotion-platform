import { expect, test, type Page } from "@playwright/test";

async function openCheckout(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("staff@restaurant-demo.example.com");
  await page.getByLabel("Password").fill(process.env.E2E_DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
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
  page.on("request", (request) => {
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
  await wizard.getByRole("button", { name: "Review redemption" }).click();
  await expect(wizard.getByText("$45.00", { exact: true })).toBeVisible();
  await expect(wizard.getByText("$40.00", { exact: true })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(wizard).toBeHidden();
  await expect(page.getByLabel("Phone number")).toBeFocused();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  await page.getByRole("button", { name: "Find customer" }).click();
  await expect(wizard.getByRole("heading", { name: /Step 4 of 4/ })).toBeFocused();
  expect(quotes).toBe(3);
  await page.reload();
  await expect(wizard.getByRole("heading", { name: /Step 4 of 4/ })).toBeVisible();
  await expect(wizard.getByText("WIZARD-75")).toBeVisible();
  await expect(wizard.getByText("$40.00", { exact: true })).toBeVisible();
  expect(quotes).toBe(4);
  expect(redeems).toBe(0);
});

test("reopens an unsubmitted new-customer draft without creating a customer", async ({ page }) => {
  let creations = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/staff/customers")) creations++;
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
