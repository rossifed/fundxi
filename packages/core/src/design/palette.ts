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
  // Brand wordmark blue — reserved for the fundXI logo ONLY (not UI
  // elements). Sampled from the official logo. See context/FUNDXI-BRIEF.md.
  brandBlue: string;
  // Translucent brand blue — active-state surfaces (selected tabs, etc.).
  brandBlueSoft: string;
  // Interactive accent blue — selected/primary UI states (active chips,
  // primary buttons, active filter). A clean azure, distinct from the
  // logo-only `brandBlue` (indigo) and from `accent` (lavender). `Soft` is
  // the translucent fill for active surfaces. The only blue allowed on
  // interactive UI; do NOT reuse `brandBlue` for that.
  accentBlue: string;
  accentBlueSoft: string;
  // Surfaces.
  bg: string;
  tooltipBg: string;
  surfaceDeep: string;
  surfaceDeeper: string;
  // Neutral fallback for a team with no provider kit colour (the real colour
  // is per-row provider data on `Team.color`; this is only the "—" stand-in).
  neutralTeam: string;
  // Ambient gradient stops (radial bg on the App shell).
  grad1: string;
  grad2: string;
  grad3: string;
  grad4: string;
};

const dark: Palette = {
  actionBuy: "#5CF26C",
  actionSell: "#F41258",
  positive: "#5CF26C", // aligned → green canonical (was #00805d)
  negative: "#F41258", // aligned → red canonical (was #E41541)
  cardYellow: "#E0A800",
  chartPrimary: "#2F6BFF", // aligned → blue canonical (was #183C82)
  chartNegative: "#F41258",
  accent: "#2F6BFF", // aligned → blue canonical (was #9CA0DD lavender)
  brandGreen: "#5CF26C", // aligned → green canonical (was #48ff43)
  brandBlue: "#2F6BFF", // aligned → blue canonical (was #5058f8, logo)
  brandBlueSoft: "rgba(47, 107, 255, 0.16)", // aligned (was 80,88,248)
  accentBlue: "#2F6BFF",
  accentBlueSoft: "rgba(47, 107, 255, 0.18)",
  bg: "#020406",
  tooltipBg: "#0d0d0f",
  surfaceDeep: "#0d1419",
  surfaceDeeper: "#0b0f14",
  neutralTeam: "#3b4049",
  grad1: "#2F6BFF", // aligned → blue canonical (was #393690 violet)
  grad2: "#2F6BFF", // aligned → blue canonical (was #11377E)
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

// Categorical data-viz ramp for portfolio allocation charts (by team / role /
// age). Tints → shades of the brand blue (`brandBlue` #5058f8), so the
// breakdowns read as one brand with the logo. This is NOT a semantic colour:
// green/red stay reserved for P&L; allocation is neutral categorical data, and
// blue keeps it visually distinct from performance. Largest segment first =
// lightest. Shared across apps so the ramp lives in one place, not as inline
// hex literals in each chart component. See context/FUNDXI-BRIEF.md.
export const chart_category_ramp: readonly string[] = [
  "#C2C6FF",
  "#9AA1FC",
  "#737CFA",
  "#5058F8",
  "#414AD8",
  "#343BB0",
  "#282E88",
  "#1C2063",
] as const;

// Avatar background ramp — deterministic identity colours (hashed seed → one
// colour, so the same entity always gets the same hue). Categorical, NOT
// semantic: a 10-hue spread kept wide so adjacent avatars stay distinguishable.
// Centralised here (not inline in avatar.ts) so every colour in the app lives
// in the palette module. Consumed by domain/identity/avatar.ts.
export const avatar_ramp: readonly string[] = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#F97316",
  "#6366F1",
  "#A855F7",
] as const;

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
