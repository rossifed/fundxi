import { useEffect, useSyncExternalStore } from "react";
import { trading_locks, type TeamLock } from "@fundxi/core/api/trading_api";

const REFRESH_MS = 45_000;

// The live-trading lock for a team right now (or undefined when open). Reactive:
// the component re-renders as matches start, hit half-time, and end.
export function useTeamLock(team_id: string | null | undefined): TeamLock | undefined {
  const snap = useSyncExternalStore(trading_locks.subscribe, trading_locks.snapshot, trading_locks.snapshot);
  return team_id ? snap.get(team_id) : undefined;
}

// The whole locked-teams map — for surfaces that span MANY players/teams at once
// (close-all, basket, screener bulk): test each team_id against it.
export function useLockedTeams(): ReadonlyMap<string, TeamLock> {
  return useSyncExternalStore(trading_locks.subscribe, trading_locks.snapshot, trading_locks.snapshot);
}

// Mount ONCE at the app root: keeps the locked-teams set fresh so trade buttons
// enable/disable as matches change phase, without a per-component fetch.
export function useTradeLockRefresh(): void {
  useEffect(() => {
    void trading_locks.refresh();
    const id = setInterval(() => void trading_locks.refresh(), REFRESH_MS);
    const on_focus = () => void trading_locks.refresh();
    window.addEventListener("focus", on_focus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", on_focus);
    };
  }, []);
}
