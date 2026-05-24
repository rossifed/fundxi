// Design palette — single source of truth for theme-switchable colours
// across every app (web today, mobile tomorrow).
//
// `apps/web` derives its CSS custom properties from this module via
// `palette_to_css_block`. `apps/mobile` will build its unistyles themes
// from the same data. RGBA white/black overlays (text/surface) remain
// inline in `apps/web/src/ui/design/tokens.ts` as transitional values —
// they are theme-agnostic on a dark UI.
//
// Naming is semantic, not visual: `positive`/`negative` instead of
// `green`/`red` so alternate themes can rehue them freely.

export type ThemeName = "dark" | "ocean";

export type Palette = {
  // Brand action colours — Buy/Sell, Long/Short.
  actionBuy: string;
  actionSell: string;
  // P&L / winners-losers semantic.
  positive: string;
  negative: string;
  // Discipline — yellow card (red card reuses `negative`).
  cardYellow: string;
  // Chart primaries.
  chartPrimary: string;
  chartNegative: string;
  // Accents (hero, decorative).
  accent: string;
  brandGreen: string;
  // Surfaces.
  bg: string;
  tooltipBg: string;
  surfaceDeep: string;
  surfaceDeeper: string;
  // Ambient gradient stops (radial bg on the App shell).
  grad1: string;
  grad2: string;
  grad3: string;
  grad4: string;
};

const dark: Palette = {
  actionBuy: "#5CF26C",
  actionSell: "#F41258",
  positive: "#00805d",
  negative: "#E41541",
  cardYellow: "#E0A800",
  chartPrimary: "#183C82",
  chartNegative: "#F41258",
  accent: "#9CA0DD",
  brandGreen: "#48ff43",
  bg: "#020406",
  tooltipBg: "#0d0d0f",
  surfaceDeep: "#0d1419",
  surfaceDeeper: "#0b0f14",
  grad1: "#393690",
  grad2: "#11377E",
  grad3: "#07081D",
  grad4: "#020109",
};

const ocean: Palette = {
  ...dark,
  actionBuy: "#06B6D4",
  positive: "#14B8A6",
  chartPrimary: "#0EA5E9",
  accent: "#67E8F9",
  grad1: "#0E7490",
  grad2: "#0C4A6E",
};

export const themes: Record<ThemeName, Palette> = { dark, ocean };

// camelCase → kebab-case: `actionBuy` → `action-buy`.
function to_kebab(s: string): string {
  return s.replace(/[A-Z0-9]+/g, (m, i: number) => (i === 0 ? m : `-${m}`)).toLowerCase();
}

// Emit a CSS rule block for one theme — used by `apps/web` to generate
// `theme.css`. Returns content like:
//
//   :root, [data-theme="dark"] {
//     --color-action-buy: #5CF26C;
//     ...
//   }
export function palette_to_css_block(name: ThemeName, palette: Palette): string {
  const selector = name === "dark" ? `:root,\n[data-theme="dark"]` : `[data-theme="${name}"]`;
  const lines = Object.entries(palette).map(
    ([key, value]) => `  --color-${to_kebab(key)}: ${value};`,
  );
  return `${selector} {\n${lines.join("\n")}\n}`;
}

// Whole-stylesheet helper — concatenates every theme.
export function themes_to_css(): string {
  return (Object.entries(themes) as Array<[ThemeName, Palette]>)
    .map(([name, palette]) => palette_to_css_block(name, palette))
    .join("\n\n");
}
