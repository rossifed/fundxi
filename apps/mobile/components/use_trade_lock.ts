import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";

import { trading_locks, type TeamLock } from "@fundxi/core/api/trading_api";

const REFRESH_MS = 45_000;

// The live-trading lock for a team right now (undefined when open). Reactive.
export function useTeamLock(team_id: string | null | undefined): TeamLock | undefined {
  const snap = useSyncExternalStore(trading_locks.subscribe, trading_locks.snapshot, trading_locks.snapshot);
  return team_id ? snap.get(team_id) : undefined;
}

// The whole locked-teams map — for surfaces spanning many players (close-all).
export function useLockedTeams(): ReadonlyMap<string, TeamLock> {
  return useSyncExternalStore(trading_locks.subscribe, trading_locks.snapshot, trading_locks.snapshot);
}

// Mount ONCE at the root: keep the locked-teams set fresh (interval + on
// foreground) so trade buttons disable/enable as matches change phase.
export function useTradeLockRefresh(): void {
  useEffect(() => {
    void trading_locks.refresh();
    const id = setInterval(() => void trading_locks.refresh(), REFRESH_MS);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void trading_locks.refresh();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, []);
}
