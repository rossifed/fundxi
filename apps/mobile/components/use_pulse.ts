// usePulse — single-shot price-tick pulse signal (RN port of
// apps/web/src/ui/hooks/use_pulse.ts). Returns "up"/"down" for ~450ms when
// the value changes, null otherwise.

import { useEffect, useRef, useState } from "react";

const PULSE_MS = 450;

export function usePulse(value: number): "up" | "down" | null {
  const prev = useRef<number>(value);
  const [pulse, set_pulse] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (prev.current === value) return;
    set_pulse(value > prev.current ? "up" : "down");
    prev.current = value;
    const t = setTimeout(() => set_pulse(null), PULSE_MS);
    return () => clearTimeout(t);
  }, [value]);

  return pulse;
}
