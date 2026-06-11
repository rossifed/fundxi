import { describe, expect, it } from "vitest";

import { palette_to_css_block, themes, themes_to_css } from "./palette";

describe("palette", () => {
  it("dark theme has every required token", () => {
    const dark = themes.dark;
    expect(dark.actionBuy).toBe("#5CF26C");
    expect(dark.actionSell).toBe("#F41258");
    expect(dark.positive).toBe("#5CF26C");
    expect(dark.negative).toBe("#F41258");
    expect(dark.bg).toBe("#020406");
  });

  it("ocean inherits dark and only overrides the documented keys", () => {
    const { dark, ocean } = themes;
    // overridden
    expect(ocean.actionBuy).toBe("#06B6D4");
    expect(ocean.positive).toBe("#14B8A6");
    expect(ocean.chartPrimary).toBe("#0EA5E9");
    expect(ocean.accent).toBe("#67E8F9");
    expect(ocean.grad1).toBe("#0E7490");
    expect(ocean.grad2).toBe("#0C4A6E");
    // inherited (sample)
    expect(ocean.bg).toBe(dark.bg);
    expect(ocean.negative).toBe(dark.negative);
    expect(ocean.grad3).toBe(dark.grad3);
    expect(ocean.grad4).toBe(dark.grad4);
  });

  it("palette_to_css_block emits :root for dark and [data-theme=X] otherwise", () => {
    const dark_block = palette_to_css_block("dark", themes.dark);
    expect(dark_block).toContain(`:root,\n[data-theme="dark"]`);
    expect(dark_block).toContain("--color-action-buy: #5CF26C;");
    expect(dark_block).toContain("--color-positive: #5CF26C;");
    expect(dark_block).toContain("--color-tooltip-bg: #0d0d0f;");
    expect(dark_block).toContain("--color-grad-1: #2F6BFF;");

    const ocean_block = palette_to_css_block("ocean", themes.ocean);
    expect(ocean_block.startsWith(`[data-theme="ocean"] {`)).toBe(true);
    expect(ocean_block).not.toContain(":root");
    expect(ocean_block).toContain("--color-action-buy: #06B6D4;");
  });

  it("themes_to_css concatenates every theme", () => {
    const css = themes_to_css();
    expect(css).toContain(`:root,\n[data-theme="dark"]`);
    expect(css).toContain(`[data-theme="ocean"] {`);
  });
});
