import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Markdown } from "./Markdown";

describe("Markdown safety", () => {
  it("drops raw HTML and unsafe link protocols", () => {
    const { container } = render(
      <Markdown
        content={[
          '<img src="x" onerror="alert(1)">',
          "",
          "[click me](javascript:alert(1))",
          "",
          "[safe](https://example.com)",
        ].join("\n")}
      />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
    const safe = container.querySelector('a[href="https://example.com/"]');
    expect(safe).toHaveAttribute("target", "_blank");
    expect(safe).toHaveAttribute("rel", "noopener noreferrer");
  });
});
