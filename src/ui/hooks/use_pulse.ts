/* usePulse — single-shot price-tick pulse signal.
 *
 * Tracks the previous value across renders and returns ``"up"`` /
 * ``"down"`` for ~450ms each time the value changes. Returns ``null``
 * otherwise. The consumer just toggles a className (``price-pulse-up``
 * / ``price-pulse-down``) defined in ``globals.css``. */

import { useEffect, useRef, useState } from "react";

// Matches the 450ms CSS animation in globals.css (.price-pulse-*).
const PULSE_MS = 450;

export function usePulse(value: number): "up" | "down" | null {
  const prev = useRef<number>(value);
  const [pulse, set_pulse] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (prev.current === value) return;
    set_pulse(value > prev.current ? "up" : "down");
    prev.current = value;
    const t = window.setTimeout(() => set_pulse(null), PULSE_MS);
    return () => window.clearTimeout(t);
  }, [value]);

  return pulse;
}

export function pulse_class(pulse: "up" | "down" | null): string {
  if (pulse === "up") return "price-pulse-up";
  if (pulse === "down") return "price-pulse-down";
  return "";
}
