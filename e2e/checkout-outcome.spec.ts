import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

for (const scenario of [
  { name: "disconnect", phone: "4165550193" },
  { name: "timeout", phone: "4165550194" },
  { name: "reload", phone: "4165550195" }
]) {
  test(
    "committed redemption stays locked when the browser loses confirmation by " + scenario.name,
    async ({ page }) => {
      const receipt = "E2E-76-" + scenario.name.toUpperCase();
      await page.goto("/login");
      await page.getByLabel("Email").fill("staff@restaurant-demo.example.com");
      await page.getByLabel("Password").fill(process.env.E2E_DEMO_PASSWORD!);
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.getByRole("link", { name: /Riverside Demo/ }).click();
      await page.getByRole("link", { name: "Staff checkout", exact: true }).click();

      const wizard = page.getByRole("dialog", { name: "Promotion checkout" });
      await page.getByLabel("Phone number").fill(scenario.phone);
      await page.getByRole("button", { name: "Find customer" }).click();
      await wizard.getByLabel("Acquisition channel").selectOption({ label: "Walk-in" });
      await wizard.getByRole("button", { name: "Create customer" }).click();
      await wizard.getByLabel("Bill subtotal ($)").fill("40.00");
      await wizard.getByLabel("Receipt number").fill(receipt);
      await wizard.getByRole("button", { name: "Show offers" }).click();
      await wizard.getByRole("radio", { name: /Best Deal/ }).check();
      await wizard.getByRole("button", { name: "Review redemption" }).click();

      let attempts = 0;
      const committed = deferred<{
        status: number;
        id: string;
        input: Record<string, string>;
      }>();
      const release = deferred<void>();
      await page.route("**/api/staff/checkout", async (route) => {
        const input = route.request().postDataJSON();
        if (input.action !== "redeem") return route.continue();
        attempts++;
        try {
          // Forward to the real route and database, but withhold its response from the page.
          const response = await route.fetch({ maxRetries: 0 });
          const result = await response.json();
          committed.resolve({ status: response.status(), id: result.id, input });
          if (scenario.name !== "disconnect") await release.promise;
          await route.abort("failed").catch(() => {});
        } catch (error) {
          committed.reject(error);
        }
      });

      const db = new PrismaClient();
      try {
        await wizard.getByRole("button", { name: "Confirm redemption", exact: true }).dblclick();
        const result = await committed.promise;
        expect(result.status).toBe(201);
        expect(result.id).toBeTruthy();
        if (scenario.name === "reload") await page.reload();
        const warning = wizard.getByRole("alert").filter({ hasText: "Redemption outcome unknown" });
        await expect(warning).toContainText("Ask a manager to check this receipt", {
          timeout: 20_000
        });
        release.resolve();
        await expect(wizard.getByLabel("Receipt number")).toHaveValue(receipt);
        await expect(wizard.getByLabel("Receipt number")).not.toBeEditable();
        await expect(
          wizard.getByRole("button", { name: "Confirm redemption", exact: true })
        ).toBeHidden();
        await wizard.getByLabel("Receipt number").press("Enter");
        await page.reload();
        await expect(warning).toBeVisible();
        await expect(wizard.getByLabel("Bill subtotal ($)")).toHaveValue("40.00");
        await expect(wizard.getByRole("button", { name: "Show offers" })).toBeHidden();
        expect(attempts).toBe(1);

        // The database also rejects a deliberate duplicate request independently of the UI lock.
        const retry = await page.request.post("/api/staff/checkout", {
          headers: { origin: new URL(page.url()).origin },
          data: result.input
        });
        expect(retry.status()).toBe(409);
        await expect(retry.json()).resolves.toMatchObject({
          error: { code: "RECEIPT_ALREADY_REDEEMED" }
        });
        const { organizationId, branchId } = result.input;
        await expect(
          db.redemption.findMany({
            where: {
              organizationId,
              branchId,
              normalizedReceiptNumber: receipt,
              status: "COMPLETED"
            },
            select: { id: true }
          })
        ).resolves.toEqual([{ id: result.id }]);
        await expect(
          db.auditLog.count({
            where: { organizationId, branchId, action: "REDEMPTION_CREATED", entityId: result.id }
          })
        ).resolves.toBe(1);

        await wizard.getByRole("button", { name: "Start over" }).click();
        const reset = page.getByRole("alertdialog", { name: "Start a new checkout?" });
        await expect(reset).toContainText("Confirm that a manager checked this receipt");
        await reset.getByRole("button", { name: "Receipt checked. Start over" }).click();
        await expect(page.getByLabel("Phone number")).toBeEmpty();
        await expect(wizard).toBeHidden();
      } finally {
        release.resolve();
        await db.$disconnect();
      }
    }
  );
}
