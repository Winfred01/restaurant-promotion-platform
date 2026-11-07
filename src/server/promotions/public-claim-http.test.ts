import { afterEach, describe, expect, it, vi } from "vitest";

import { createPublicClaimRouteHandler } from "./public-claim-http";

const url = "https://restaurant.example/api/public/claims";
const valid = {
  organizationId: "org",
  branchId: "branch",
  promotionId: "promotion",
  phoneNumber: "(416) 555-0103"
};

function request(body: unknown, origin = "https://restaurant.example") {
  return new Request(url, {
    method: "POST",
    headers: { origin, "Content-Type": "application/json", "x-vercel-forwarded-for": "192.0.2.1" },
    body: JSON.stringify(body)
  });
}

describe("public claim HTTP", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns one response for a created, unknown, duplicate, or limited claim", async () => {
    vi.stubEnv("VERCEL", "1");
    const claim = vi.fn(async () => {});
    const post = createPublicClaimRouteHandler({ claim });
    const first = await post(request(valid));
    const second = await post(request(valid));

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(await first.json()).toEqual(await second.json());
    expect(first.headers.get("Cache-Control")).toBe("no-store");
    expect(claim).toHaveBeenCalledWith({ ...valid, remoteAddress: "192.0.2.1" });
  });

  it("rejects cross-origin and oversized requests before calling the service", async () => {
    const claim = vi.fn(async () => {});
    const post = createPublicClaimRouteHandler({ claim });
    expect((await post(request(valid, "https://attacker.example"))).status).toBe(403);
    expect((await post(request({ ...valid, padding: "x".repeat(2048) }))).status).toBe(400);
    expect(claim).not.toHaveBeenCalled();
  });

  it("ignores a spoofed Vercel address outside Vercel", async () => {
    vi.stubEnv("VERCEL", "0");
    const claim = vi.fn(async () => {});
    const post = createPublicClaimRouteHandler({ claim });
    await post(request(valid));
    expect(claim).toHaveBeenCalledWith({ ...valid, remoteAddress: "unknown" });
  });

  it("returns a generic invalid-input or unavailable message", async () => {
    const claim = vi.fn(async () => {
      throw new Error("private database details");
    });
    const post = createPublicClaimRouteHandler({ claim });
    const unavailable = await post(request(valid));
    expect(unavailable.status).toBe(503);
    expect(JSON.stringify(await unavailable.json())).not.toContain("private database details");
    expect((await post(request(null))).status).toBe(400);
  });
});
