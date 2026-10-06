import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LoginForm } from "./login-form";

describe("employee login form", () => {
  it("renders required employee credentials and a sign-in action", () => {
    const html = renderToStaticMarkup(<LoginForm showDemoAccounts={false} />);

    expect(html).toContain('name="email"');
    expect(html).toContain('name="password"');
    expect(html).toContain("Sign in");
    expect(html).not.toContain("owner@restaurant-demo.example.com");
  });

  it("shows demo identities only when explicitly enabled", () => {
    const html = renderToStaticMarkup(<LoginForm showDemoAccounts />);

    expect(html).toContain("owner@restaurant-demo.example.com");
    expect(html).toContain("manager@restaurant-demo.example.com");
    expect(html).toContain("staff@restaurant-demo.example.com");
    expect(html).toContain("Ask the demo operator for the password");
  });
});
