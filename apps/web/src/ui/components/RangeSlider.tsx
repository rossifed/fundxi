// UI primitive (presentation): a dual-thumb range slider.
//
// The web parity of the native @ptomasroos/react-native-multi-slider used in
// the Screener filter sheet. Two stacked native <input type="range"> share one
// track; only their thumbs are interactive (see ``.range-input`` in
// globals.css), and a painted fill shows the selected [lo, hi] span. Colours
// flow through the design tokens.

import { color } from "@/ui/design/tokens";

interface RangeSliderProps {
  min: number;
  max: number;
  step: number;
  value: [number, number];
  on_change: (range: [number, number]) => void;
  /** Optional value labels shown above the two ends (e.g. ``€20M``). */
  format?: (v: number) => string;
}

export function RangeSlider({ min, max, step, value, on_change, format }: RangeSliderProps) {
  const span = max - min || 1;
  const [lo, hi] = value;
  const lo_pct = ((lo - min) / span) * 100;
  const hi_pct = ((hi - min) / span) * 100;

  // Thumbs can't cross: each end is clamped against the other.
  const set_lo = (v: number) => on_change([Math.min(v, hi), hi]);
  const set_hi = (v: number) => on_change([lo, Math.max(v, lo)]);

  return (
    <div style={{ padding: "2px 2px 4px" }}>
      {format && (
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>{format(lo)}</span>
          <span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>{format(hi)}</span>
        </div>
      )}
      <div style={{ position: "relative", height: 22 }}>
        <div style={{ position: "absolute", top: 9, left: 0, right: 0, height: 4, borderRadius: 2, background: "rgba(255,255,255,.14)" }} />
        <div
          style={{
            position: "absolute",
            top: 9,
            height: 4,
            borderRadius: 2,
            background: color.accentBlue,
            left: `${lo_pct}%`,
            width: `${Math.max(0, hi_pct - lo_pct)}%`,
          }}
        />
        <input
          className="range-input"
          type="range"
          min={min}
          max={max}
          step={step}
          value={lo}
          aria-label="Minimum"
          onChange={e => set_lo(Number(e.target.value))}
          // Raise the lower thumb when both ends sit high, so it stays grabbable.
          style={{ zIndex: lo_pct > 55 ? 5 : 3 }}
        />
        <input
          className="range-input"
          type="range"
          min={min}
          max={max}
          step={step}
          value={hi}
          aria-label="Maximum"
          onChange={e => set_hi(Number(e.target.value))}
          style={{ zIndex: 4 }}
        />
      </div>
    </div>
  );
}
