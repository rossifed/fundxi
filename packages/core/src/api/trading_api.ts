import { ApiError, api_get } from "@fundxi/core/infrastructure/api_client";

// Live-trading lock — which teams are currently NON-tradeable (match in play, or
// just before/after the whistle within a buffer). The UI reads this to disable +
// explain every trade entry point; the authoritative block is the /api/trades
// guard. A framework-agnostic singleton store (the apps wrap it in a hook), so
// web and mobile share one source. Never throws — keeps the last known set.

export interface TeamLock {
  team_id: string;
  reason: string;
  reopens_at: string | null;
}

let _locks = new Map<string, TeamLock>();
let _snapshot: ReadonlyMap<string, TeamLock> = new Map();
const _subscribers = new Set<() => void>();

function _emit(): void {
  _snapshot = new Map(_locks);
  for (const f of _subscribers) f();
}

export const trading_locks = {
  subscribe(f: () => void): () => void {
    _subscribers.add(f);
    return () => {
      _subscribers.delete(f);
    };
  },
  snapshot(): ReadonlyMap<string, TeamLock> {
    return _snapshot;
  },
  get(team_id: string | null | undefined): TeamLock | undefined {
    return team_id ? _snapshot.get(team_id) : undefined;
  },
  async refresh(): Promise<void> {
    try {
      const rows = await api_get<TeamLock[]>("/api/trading/locked");
      _locks = new Map(rows.map(r => [r.team_id, r]));
      _emit();
    } catch {
      /* keep the last known set — a transient fetch error never enables a locked trade */
    }
  },
};

// Detect a "trading locked" 409 from a failed trade (the server backstop), so any
// entry point — even one that didn't proactively disable — shows the friendly
// reason instead of a raw error. Returns the reason, or null if it's another error.
export function trading_locked_reason(err: unknown): string | null {
  if (err instanceof ApiError && err.status === 409 && err.body && typeof err.body === "object") {
    const body = err.body as { error?: unknown; reason?: unknown };
    if (body.error === "trading_locked") return typeof body.reason === "string" ? body.reason : "live";
  }
  return null;
}

// Short, English label shown ON the disabled trade button, by lock reason.
export function trade_lock_label(reason: string | undefined): string {
  switch (reason) {
    case "starting":
      return "Starting";
    case "halftime_soon":
      return "Half-time";
    case "fulltime_soon":
      return "Match ended";
    default:
      return "Live"; // in play
  }
}

// Short caption under the button: when trading comes back.
export function trade_lock_caption(reason: string | undefined): string {
  switch (reason) {
    case "starting":
      return "Kicks off soon";
    case "halftime_soon":
      return "Opens shortly";
    case "fulltime_soon":
      return "Reopens soon";
    default:
      return "Reopens at half-time"; // in play
  }
}
