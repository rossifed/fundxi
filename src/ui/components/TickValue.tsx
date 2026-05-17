/* TickValue — modern price-change feedback.
 *
 * Wraps a displayed value and, when it changes between renders (a live
 * tick), gives a single brief "balanced" pulse: tinted background +
 * text colour (via the shared ``.price-pulse-*`` classes / usePulse)
 * plus a directional caret (▲/▼) that appears only during the pulse.
 * Localised, one-shot, never looping — the modern Robinhood/Coinbase
 * pattern, not the dated "blink everywhere".
 *
 * Reuses the existing ``usePulse`` hook (single source of change
 * detection) so Screener / Portfolio / Home stay consistent. Formatting
 * stays at the call site (pass the formatted content as children); only
 * the raw numeric ``value`` drives the flash.
 */

import type { ReactNode } from "react";
import { pulse_class, usePulse } from "@/ui/hooks/use_pulse";

interface TickValueProps {
  value: number;
  children: ReactNode;
  /** Show the ▲/▼ caret during the pulse (default true). */
  caret?: boolean;
}

export function TickValue({ value, children, caret = true }: TickValueProps) {
  const pulse = usePulse(value);

  return (
    <span
      className={pulse_class(pulse)}
      style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "0 2px" }}
    >
      {caret && pulse && (
        <span
          aria-hidden
          style={{
            fontSize: "0.7em",
            lineHeight: 1,
            color: pulse === "up" ? "var(--color-positive)" : "var(--color-negative)",
          }}
        >
          {pulse === "up" ? "▲" : "▼"}
        </span>
      )}
      {children}
    </span>
  );
}
