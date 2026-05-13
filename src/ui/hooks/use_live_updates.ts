// Live-update hooks — open a Server-Sent Events stream against the
// streaming service and expose a monotonically-increasing "version"
// counter that bumps on every `update` frame.
//
// DDD role: UI adapter. Framework-agnostic on purpose (no TanStack
// Query dependency): a component re-fetches its data by listing the
// returned version in the deps array of the effect that loads it.
// The SSE frame is a *hint* ("something changed for this resource") —
// the source of truth stays the BFF, which the component re-queries.
//
// Usage:
//
//   const liveVersion = useFixtureLiveVersion(match.fixture_id);
//   useEffect(() => { loadCommentaries(); }, [match.fixture_id, liveVersion]);
//
// Or with the convenience wrapper:
//
//   useLiveRefetch(useFixtureLiveVersion(match.fixture_id), loadCommentaries);
//
// Topics (see backend/src/streaming/domain/notification.ts equivalent):
//   fixture/{id}  — events, comments, status, lineup, per-player stats
//   player/{id}   — that player's price ticks
//   prices        — every player's price ticks (Portfolio filters client-side)
//   news          — news refreshed
//   standings     — group tables refreshed

import { useEffect, useRef, useState } from "react";
import { stream_url } from "@/infrastructure/stream_client";

/** Subscribe to an SSE topic; return a counter that increments on each `update`. */
function useTopicVersion(topic_path: string | null): number {
  const [version, set_version] = useState(0);
  // Keep the latest setter stable across reconnects without re-opening the stream.
  const set_ref = useRef(set_version);
  set_ref.current = set_version;

  useEffect(() => {
    if (topic_path === null) return;
    let source: EventSource | null = new EventSource(stream_url(topic_path));
    const on_update = () => set_ref.current(v => v + 1);
    source.addEventListener("update", on_update);
    // EventSource auto-reconnects on error; nothing to do but let it.
    return () => {
      source?.removeEventListener("update", on_update);
      source?.close();
      source = null;
    };
  }, [topic_path]);

  return version;
}

/** Live version for one fixture's stream. Pass `null` to disable (e.g. no fixture_id). */
export function useFixtureLiveVersion(fixture_id: number | null | undefined): number {
  return useTopicVersion(fixture_id == null ? null : `fixture/${fixture_id}`);
}

/** Live version for one player's price-tick stream. */
export function usePlayerLiveVersion(player_id: number | null | undefined): number {
  return useTopicVersion(player_id == null ? null : `player/${player_id}`);
}

/** Live version for the global "any match had activity" stream — the Home
 * Match Center card uses it to notice a match going live (or ending). */
export function useMatchesLiveVersion(): number {
  return useTopicVersion("matches");
}

/** Live version for the global price-tick stream (Portfolio page). */
export function usePricesLiveVersion(): number {
  return useTopicVersion("prices");
}

/** Live version for the news stream (Home feed). */
export function useNewsLiveVersion(): number {
  return useTopicVersion("news");
}

/** Live version for the standings stream (group tables). */
export function useStandingsLiveVersion(): number {
  return useTopicVersion("standings");
}

/**
 * Convenience: call `refetch` whenever `version` changes (but not on the
 * initial render — the component is expected to do its first load itself).
 */
export function useLiveRefetch(version: number, refetch: () => void): void {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    refetch();
    // `refetch` is intentionally not in the deps: callers pass a fresh
    // closure each render; we only want to react to `version` ticking.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
}
