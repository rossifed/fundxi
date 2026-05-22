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

// ── Shared SSE channels ────────────────────────────────────────────
// One EventSource per topic path, shared by every subscriber and
// ref-counted: opened on the first subscriber, closed when the last
// leaves. Without this, every component calling a live hook opened its
// own connection — N components ⇒ N sockets to the same topic. One
// socket per topic per browser keeps the streaming server's connection
// count proportional to *users*, not to mounted components.

interface TopicChannel {
  source: EventSource;
  listeners: Set<() => void>;
}

const _channels = new Map<string, TopicChannel>();

// ── Stream connection status ────────────────────────────────────────
// EventSources auto-reconnect under the hood; we surface their
// connected/dropped state so the UI can show a "live offline" hint
// instead of silently going stale. Global — every topic hits the same
// streaming service, so all channels share fate.

export type StreamStatus = "online" | "offline" | "unknown";

let _stream_status: StreamStatus = "unknown";
const _status_listeners = new Set<() => void>();

function _set_stream_status(next: StreamStatus): void {
  if (next === _stream_status) return;
  _stream_status = next;
  for (const listener of _status_listeners) listener();
}

/** Subscribe to an SSE topic's ``update`` frames. Returns an
 * unsubscribe function. The underlying EventSource is shared across
 * all subscribers of the same topic. */
export function subscribe_topic(topic_path: string, on_update: () => void): () => void {
  let channel = _channels.get(topic_path);
  if (!channel) {
    const source = new EventSource(stream_url(topic_path));
    const listeners = new Set<() => void>();
    // EventSource auto-reconnects on error; just fan out `update` frames.
    source.addEventListener("update", () => {
      for (const listener of listeners) listener();
    });
    source.onopen = () => _set_stream_status("online");
    source.onerror = () => _set_stream_status("offline");
    channel = { source, listeners };
    _channels.set(topic_path, channel);
  }
  channel.listeners.add(on_update);
  return () => {
    const ch = _channels.get(topic_path);
    if (!ch) return;
    ch.listeners.delete(on_update);
    if (ch.listeners.size === 0) {
      ch.source.close();
      _channels.delete(topic_path);
    }
  };
}

/** The shared SSE connection status: "online" once a stream connects,
 * "offline" when it drops (the EventSource keeps retrying underneath),
 * "unknown" before any stream is opened. */
export function useStreamStatus(): StreamStatus {
  const [status, set_status] = useState<StreamStatus>(_stream_status);
  useEffect(() => {
    const listener = () => set_status(_stream_status);
    _status_listeners.add(listener);
    listener();
    return () => {
      _status_listeners.delete(listener);
    };
  }, []);
  return status;
}

/** Subscribe to an SSE topic; return a counter that increments on each `update`. */
function useTopicVersion(topic_path: string | null): number {
  const [version, set_version] = useState(0);
  useEffect(() => {
    if (topic_path === null) return;
    return subscribe_topic(topic_path, () => set_version(v => v + 1));
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
