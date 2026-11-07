import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("public landing page", () => {
  it("explains the staff workflow and links to the real sign-in route", () => {
    const html = renderToStaticMarkup(<Home />);

    expect(html).toContain("From phone");
    expect(html).toContain("The Staff checkout");
    expect(html).toContain("Confirm the receipt");
    expect(html).toContain("promotion-linked sales");
    expect(html).toContain("public URL will be");
    expect(html).toContain('href="/login"');
    expect(html).toContain('href="/demo"');
    expect(html).toContain("https://github.com/Winfred01/restaurant-promotion-platform");
    expect(html).toContain('href="#home-title"');
  });
});
