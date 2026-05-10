import type { Position } from "@/domain/player/player";

// Brand & semantic colors. Strict palette: green for up, red for down, white/grey for everything else.
export const colors = {
  background: "#020406",
  green: "#216c6e",
  green_soft: "#216c6e",
  red: "#E41541",
  white: "#fff",
  text: {
    primary: "#fff",
    secondary: "rgba(255,255,255,.5)",
    tertiary: "rgba(255,255,255,.35)",
    muted: "rgba(255,255,255,.25)",
    faint: "rgba(255,255,255,.15)",
  },
  surface: {
    card: "rgba(255,255,255,.03)",
    card_soft: "rgba(255,255,255,.025)",
    active: "rgba(255,255,255,.06)",
  },
  border: "rgba(255,255,255,.04)",
} as const;

export const ambient_gradient =
  "radial-gradient(ellipse 85% 60% at 100% 0%, #393690 0%, #11377E 25%, #07081D 65%, #020109 100%)";

// Position UI tokens (presentation only — domain stays in @/domain/player/player.ts)
export const position_color: Record<Position, string> = {
  FW: "rgba(255,255,255,.45)",
  MF: "rgba(255,255,255,.45)",
  DF: "rgba(255,255,255,.45)",
  GK: "rgba(255,255,255,.45)",
};
