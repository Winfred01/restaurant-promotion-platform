import { describe, expect, it, vi } from "vitest";

import { AuthenticationRequiredError } from "@/server/auth/session";
import { AuthorizationDeniedError } from "@/server/authorization/guard";
import { RedemptionConflictError } from "./checkout";
import { createStaffCheckoutRouteHandler } from "./staff-checkout-http";
import type { StaffCheckoutWorkflow } from "./staff-checkout";

function workflow(): StaffCheckoutWorkflow {
  return {
    quote: vi.fn(async () => ({ offers: [] })),
    redeem: vi.fn(async () => ({
      id: "redemption-1",
      receiptNumber: "R-1",
      billSubtotalCents: 1000,
      discountCents: 200,
      netBillCents: 800
    }))
  };
}

function request(body: unknown, origin = "http://localhost") {
  return new Request("http://localhost/api/staff/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body)
  });
}

describe("staff checkout HTTP", () => {
  it("routes a quote and completed redemption to the workflow", async () => {
    const service = workflow();
    const handler = createStaffCheckoutRouteHandler(service);
    const input = {
      organizationId: "org-a",
      branchId: "branch-a",
      customerId: "customer-a",
      billSubtotalCents: 1000
    };

    expect((await handler(request({ action: "quote", ...input }))).status).toBe(200);
    expect(service.quote).toHaveBeenCalledWith(input);
    const redemption = await handler(
      request({ action: "redeem", ...input, promotionId: "promotion-a", receiptNumber: "R-1" })
    );
    expect(redemption.status).toBe(201);
    await expect(redemption.json()).resolves.toMatchObject({ id: "redemption-1" });
  });

  it("rejects cross-origin checkout before calling a service", async () => {
    const service = workflow();
    const response = await createStaffCheckoutRouteHandler(service)(
      request({ action: "redeem" }, "https://attacker.example")
    );
    expect(response.status).toBe(403);
    expect(service.redeem).not.toHaveBeenCalled();
  });

  it.each([
    [new AuthenticationRequiredError(), 401, "AUTHENTICATION_REQUIRED"],
    [new AuthorizationDeniedError(), 403, "AUTHORIZATION_DENIED"],
    [new RedemptionConflictError(), 409, "REDEMPTION_CONFLICT"]
  ])("maps safe failures without exposing private details", async (error, status, code) => {
    const service = workflow();
    vi.mocked(service.redeem).mockRejectedValue(error);
    const response = await createStaffCheckoutRouteHandler(service)(request({ action: "redeem" }));
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ error: { code } });
  });
});
