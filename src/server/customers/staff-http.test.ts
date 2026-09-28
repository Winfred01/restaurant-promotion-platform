import { MembershipRole } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { AuthenticationRequiredError } from "@/server/auth/session";
import { AuthorizationDeniedError } from "@/server/authorization/guard";
import { AcquisitionChannelRequiredError } from "./creation";
import { InvalidPhoneNumberError } from "./phone";
import { createStaffCustomerRouteHandlers } from "./staff-http";
import type { StaffCustomerWorkflow } from "./staff-workflow";

const customer = {
  id: "customer-1",
  phoneNumberDisplay: "(***) ***-0123",
  acquisitionChannelId: "channel-1",
  firstSeenAt: new Date("2026-09-27T12:00:00.000Z"),
  lastSeenAt: new Date("2026-09-27T12:00:00.000Z")
};

function createWorkflow(overrides: Partial<StaffCustomerWorkflow> = {}): StaffCustomerWorkflow {
  return {
    lookup: vi.fn(async () => ({ customer })),
    create: vi.fn(async () => ({ customer, isNewCustomer: true })),
    ...overrides
  };
}

describe("staff customer HTTP handlers", () => {
  it("passes validated lookup context to the authenticated workflow", async () => {
    const workflow = createWorkflow();
    const handlers = createStaffCustomerRouteHandlers(workflow);
    const response = await handlers.GET(
      new Request(
        "http://localhost/api/staff/customers?organizationId=org-1&branchId=branch-1&phoneNumber=416-555-0123"
      )
    );

    expect(response.status).toBe(200);
    expect(workflow.lookup).toHaveBeenCalledWith({
      organizationId: "org-1",
      branchId: "branch-1",
      phoneNumber: "416-555-0123"
    });
    expect(await response.json()).toMatchObject({ customer: { id: "customer-1" } });
  });

  it("returns 201 for a newly created customer and 200 for a returning customer", async () => {
    const newWorkflow = createWorkflow();
    const newResponse = await createStaffCustomerRouteHandlers(newWorkflow).POST(
      new Request("http://localhost/api/staff/customers", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({
          organizationId: "org-1",
          branchId: "branch-1",
          phoneNumber: "416-555-0123",
          acquisitionChannelId: "channel-1"
        })
      })
    );
    const returningWorkflow = createWorkflow({
      create: vi.fn(async () => ({ customer, isNewCustomer: false }))
    });
    const returningResponse = await createStaffCustomerRouteHandlers(returningWorkflow).POST(
      new Request("http://localhost/api/staff/customers", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({
          organizationId: "org-1",
          branchId: "branch-1",
          phoneNumber: "416-555-0123"
        })
      })
    );

    expect(newResponse.status).toBe(201);
    expect(returningResponse.status).toBe(200);
  });

  it("rejects malformed JSON without echoing request content", async () => {
    const rawInput = "416-PRIVATE";
    const response = await createStaffCustomerRouteHandlers(createWorkflow()).POST(
      new Request("http://localhost/api/staff/customers", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: `{${rawInput}`
      })
    );
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(400);
    expect(body).not.toContain(rawInput);
  });

  it("rejects a cross-origin mutation before invoking the workflow", async () => {
    const workflow = createWorkflow();
    const response = await createStaffCustomerRouteHandlers(workflow).POST(
      new Request("http://localhost/api/staff/customers", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://attacker.example" },
        body: JSON.stringify({
          organizationId: "org-1",
          branchId: "branch-1",
          phoneNumber: "416-555-0123"
        })
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CSRF_VALIDATION_FAILED" }
    });
    expect(workflow.create).not.toHaveBeenCalled();
  });

  it.each([
    [new AuthenticationRequiredError(), 401, "AUTHENTICATION_REQUIRED"],
    [new AuthorizationDeniedError(), 403, "AUTHORIZATION_DENIED"],
    [new InvalidPhoneNumberError(), 400, "INVALID_PHONE_NUMBER"],
    [new AcquisitionChannelRequiredError(), 400, "ACQUISITION_CHANNEL_REQUIRED"]
  ])("maps a safe workflow error to its HTTP response", async (error, status, code) => {
    const workflow = createWorkflow({
      lookup: vi.fn(async () => {
        throw error;
      })
    });
    const response = await createStaffCustomerRouteHandlers(workflow).GET(
      new Request(
        "http://localhost/api/staff/customers?organizationId=org-1&branchId=branch-1&phoneNumber=416-555-0123"
      )
    );

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ error: { code } });
  });

  it("does not expose unexpected errors or supplied role-like values", async () => {
    const workflow = createWorkflow({
      lookup: vi.fn(async () => {
        throw new Error(`Unexpected ${MembershipRole.OWNER}`);
      })
    });
    const response = await createStaffCustomerRouteHandlers(workflow).GET(
      new Request(
        "http://localhost/api/staff/customers?organizationId=org-1&branchId=branch-1&phoneNumber=416-555-0123"
      )
    );
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(body).not.toContain(MembershipRole.OWNER);
  });
});
