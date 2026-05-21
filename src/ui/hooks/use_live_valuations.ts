/* use_live_valuations — single shared live-valuations stream.
 *
 * The problem this solves: several always-or-often-mounted components
 * (PortfolioBar, PortfolioPage, …) need "prices refreshed" on every
 * price tick. If each one subscribes + refetches on its own, a browser
 * holds N "prices" SSE sockets and fires N copies of the (large)
 * /api/players/search refetch per tick wave. At scale that multiplies
 * the streaming-server connections and BFF load by the number of
 * mounted components — pure waste.
 *
 * This module is the single shared owner:
 *   - ONE "prices" SSE subscription (via the shared channel registry),
 *     opened on the first consumer, closed when the last leaves.
 *   - ONE debounced valuations refetch per tick wave — a burst of ticks
 *     collapses to a single /api/players/search call.
 *   - a version counter fanned out to every consumer so they recompute.
 *
 * Consumers call ``useLiveValuations()`` and list the returned version
 * in a deps array. They never refetch valuations themselves.
 */

import { useEffect, useState } from "react";
import { refresh_valuations } from "@/infrastructure/repositories/valuations_repository";
import { subscribe_topic } from "@/ui/hooks/use_live_updates";

// A burst of ticks within this window collapses to one refetch. 500ms
// is well below human perception for a portfolio total yet bounds the
// refetch rate to <=2/s no matter how fast the replay ticks.
const REFRESH_DEBOUNCE_MS = 500;

let _version = 0;
const _listeners = new Set<() => void>();
let _unsubscribe_topic: (() => void) | null = null;
let _debounce_timer: ReturnType<typeof setTimeout> | null = null;

function _notify(): void {
  for (const listener of _listeners) listener();
}

async function _refresh_now(): Promise<void> {
  await refresh_valuations();
  _version += 1;
  _notify();
}

function _on_tick(): void {
  // Trailing debounce: the first tick arms the timer; ticks arriving
  // before it fires are absorbed into the same refetch.
  if (_debounce_timer !== null) return;
  _debounce_timer = setTimeout(() => {
    _debounce_timer = null;
    void _refresh_now();
  }, REFRESH_DEBOUNCE_MS);
}

function _subscribe(listener: () => void): () => void {
  _listeners.add(listener);
  if (_listeners.size === 1) {
    // First consumer: open the shared stream + hydrate once so the
    // consumer has data immediately, before any tick arrives.
    _unsubscribe_topic = subscribe_topic("prices", _on_tick);
    void _refresh_now();
  }
  return () => {
    _listeners.delete(listener);
    if (_listeners.size === 0) {
      _unsubscribe_topic?.();
      _unsubscribe_topic = null;
      if (_debounce_timer !== null) {
        clearTimeout(_debounce_timer);
        _debounce_timer = null;
      }
    }
  };
}

/** Subscribe to the shared live-valuations stream. Returns a version
 * that bumps after each (debounced, single) valuations refresh — list
 * it in a deps array to recompute derived data. One "prices" SSE
 * subscription and one refetch per tick wave, shared by every caller. */
export function useLiveValuations(): number {
  const [version, set_version] = useState(_version);
  useEffect(() => _subscribe(() => set_version(_version)), []);
  return version;
}
