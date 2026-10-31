import { RedemptionStatus } from "@prisma/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  list: vi.fn(),
  currency: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  })
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock("@/server/auth/session", () => ({ getCurrentEmployeeSession: mocks.session }));
vi.mock("@/server/db", () => ({
  prisma: { restaurantOrganization: { findUnique: mocks.currency } }
}));
vi.mock("@/server/redemptions/history", () => ({
  createRedemptionHistoryService: () => ({ list: mocks.list })
}));

import { AuthorizationDeniedError } from "@/server/authorization/guard";
import RedemptionHistoryPage from "./page";

const params = Promise.resolve({ organizationId: "org-a", branchId: "branch-a" });
const searchParams = Promise.resolve({ status: "ALL" });

describe("redemption history page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "manager-a" } });
    mocks.currency.mockResolvedValue({ currency: "CAD" });
    mocks.list.mockResolvedValue([]);
  });

  it("redirects an unauthenticated employee before querying history", async () => {
    mocks.session.mockResolvedValue(null);
    await expect(RedemptionHistoryPage({ params, searchParams })).rejects.toThrow(
      "REDIRECT:/login"
    );
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("hides the route when branch void permission is denied", async () => {
    mocks.list.mockRejectedValue(new AuthorizationDeniedError());
    await expect(RedemptionHistoryPage({ params, searchParams })).rejects.toThrow("NOT_FOUND");
    expect(mocks.currency).not.toHaveBeenCalled();
  });

  it("shows a truthful empty state for the selected branch", async () => {
    const html = renderToStaticMarkup(await RedemptionHistoryPage({ params, searchParams }));
    expect(html).toContain("No redemptions match this status");
    expect(mocks.list).toHaveBeenCalledWith({
      organizationId: "org-a",
      branchId: "branch-a",
      actorUserId: "manager-a",
      status: "ALL"
    });
  });

  it("renders completed and voided history while offering void only for completed entries", async () => {
    const common = {
      receiptNumber: "R-1",
      billSubtotalCents: 6000,
      discountCents: 1000,
      netBillCents: 5000,
      redeemedAt: new Date("2026-10-01T12:00:00Z"),
      customerPhone: "••• ••• 1234",
      promotionName: "Lunch",
      staffName: "Staff A"
    };
    mocks.list.mockResolvedValue([
      {
        ...common,
        id: "red-a",
        status: RedemptionStatus.COMPLETED,
        voidedAt: null,
        voidReason: null,
        voidedByName: null
      },
      {
        ...common,
        id: "red-b",
        status: RedemptionStatus.VOIDED,
        voidedAt: new Date("2026-10-02T12:00:00Z"),
        voidReason: "Wrong receipt",
        voidedByName: "Manager A"
      }
    ]);
    const html = renderToStaticMarkup(await RedemptionHistoryPage({ params, searchParams }));
    expect(html).toContain("Redemption history");
    expect(html).toContain("$50.00");
    expect(html).toContain("••• ••• 1234");
    expect(html).toContain("Wrong receipt");
    expect(html.match(/Void redemption/g)).toHaveLength(1);
    expect(html).not.toContain("4165551234");
  });
});
