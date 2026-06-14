// useViewport — single source of truth for responsive breakpoints.
//
// DDD role: UI hook (presentation utility). The app is styled with inline
// React styles, which cannot react to CSS media queries; this hook exposes
// the viewport width so layout-deciding components can branch their styles in
// JS. Only STRUCTURAL decisions belong here (sidebar vs bottom-nav, show the
// right rail, modal vs bottom-sheet) — leaf components stay fluid.
//
// Two breakpoints, because the two desktop "chrome" columns have different
// value: the right rail (320px) crowds the content well before the sidebar
// (220px) becomes a navigation problem.
//   width <= 767  -> phone layout  (bottom-nav, single column, bottom-sheets)
//   width >= 1100 -> wide enough to keep the right rail
//   in between    -> tablet: sidebar + content, no rail

import { useSyncExternalStore } from "react";

const MOBILE_MAX = 767;
const RAIL_MIN = 1100;

// Desktop default for the (non-browser) server snapshot — the web app is a
// client-rendered SPA, so this only guards the very first paint.
const DEFAULT_WIDTH = 1280;

function subscribe(on_change: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("resize", on_change);
  return () => window.removeEventListener("resize", on_change);
}

function get_width(): number {
  return typeof window === "undefined" ? DEFAULT_WIDTH : window.innerWidth;
}

export interface Viewport {
  width: number;
  /** Phone layout: bottom-nav, single column, bottom-sheets. */
  is_mobile: boolean;
  /** Wide enough to render the right rail without crowding the content. */
  rail_ok: boolean;
}

export function useViewport(): Viewport {
  const width = useSyncExternalStore(subscribe, get_width, () => DEFAULT_WIDTH);
  return {
    width,
    is_mobile: width <= MOBILE_MAX,
    rail_ok: width >= RAIL_MIN,
  };
}
