// Watchlist — session-scoped UI store for starred players.
//
// DDD role: UI state store (not domain). The watchlist is a pure
// presentation concern with no provider data behind it, so it lives in the
// app, not in @fundxi/core. A module-level Set + listener fan-out keeps it
// alive across tab navigation (a per-screen useState would reset on unmount)
// and lets any screen read it — the RN parity for the web RightRail watchlist.
// Not persisted to disk yet (matches web, which also keeps it in memory).

import { useSyncExternalStore } from "react";

const watched = new Set<number>();
const listeners = new Set<() => void>();

// Stable snapshot for useSyncExternalStore — only changes identity on mutation.
let snapshot: ReadonlySet<number> = new Set();

function emit() {
  snapshot = new Set(watched);
  for (const l of listeners) l();
}

export const watchlist = {
  has(id: number): boolean {
    return watched.has(id);
  },
  toggle(id: number): void {
    if (watched.has(id)) watched.delete(id);
    else watched.add(id);
    emit();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  snapshot(): ReadonlySet<number> {
    return snapshot;
  },
};

/** Reactive read of the watched-id set. Re-renders the caller on any change. */
export function useWatchlist(): ReadonlySet<number> {
  return useSyncExternalStore(watchlist.subscribe, watchlist.snapshot, watchlist.snapshot);
}
