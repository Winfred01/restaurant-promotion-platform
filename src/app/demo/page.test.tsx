import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ enterGuidedDemo: vi.fn() }));

import DemoPage from "./page";

const demoEnvironment = {
  DEMO_PUBLIC_ENTRY: "1",
  DATABASE_URL: "postgresql://localhost:5432/restaurant_demo",
  AUTH_SECRET: "a".repeat(32)
};

afterEach(() => vi.unstubAllEnvs());

describe("guided demo page", () => {
  it("offers all three real role-entry forms only in the dedicated demo environment", async () => {
    for (const [key, value] of Object.entries(demoEnvironment)) vi.stubEnv(key, value);
    const html = renderToStaticMarkup(await DemoPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Choose your place in the restaurant.");
    expect(html).toContain('value="OWNER"');
    expect(html).toContain('value="MANAGER"');
    expect(html).toContain('value="STAFF"');
    expect(html).toContain("Enter as Staff");
    expect(html).toContain("isolated demo workspace");
  });

  it("hides role entry when the flag is off and reports pool exhaustion", async () => {
    const disabled = renderToStaticMarkup(await DemoPage({ searchParams: Promise.resolve({}) }));
    expect(disabled).toContain("Demo access is closed");
    expect(disabled).not.toContain('value="OWNER"');

    for (const [key, value] of Object.entries(demoEnvironment)) vi.stubEnv(key, value);
    const exhausted = renderToStaticMarkup(
      await DemoPage({ searchParams: Promise.resolve({ error: "full" }) })
    );
    expect(exhausted).toContain("All isolated demo sessions are in use");
  });
});
