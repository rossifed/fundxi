// Live-update hooks for React Native. Mirrors the contract of
// apps/web/src/ui/hooks/use_live_updates.ts but uses `react-native-sse`
// because RN has no native `EventSource`. Topics and the
// "subscribe → bump version → caller refetches" pattern are identical.
//
// The web hook is duplicated here on purpose: hooks live in the
// presentation layer (per DDD rule "ui depends on api/domain only"),
// and we don't want @fundxi/core to take a RN dep.

import { useEffect, useState } from "react";
import EventSource from "react-native-sse";

import { stream_url } from "@fundxi/core/infrastructure/stream_client";

interface TopicChannel {
  source: EventSource<"update">;
  listeners: Set<() => void>;
}

const _channels = new Map<string, TopicChannel>();

export type StreamStatus = "online" | "offline" | "unknown";

let _stream_status: StreamStatus = "unknown";
const _status_listeners = new Set<() => void>();

function _set_stream_status(next: StreamStatus): void {
  if (next === _stream_status) return;
  _stream_status = next;
  for (const listener of _status_listeners) listener();
}

function subscribe_topic(topic_path: string, on_update: () => void): () => void {
  let channel = _channels.get(topic_path);
  if (!channel) {
    const source = new EventSource<"update">(stream_url(topic_path));
    const listeners = new Set<() => void>();
    source.addEventListener("update", () => {
      for (const listener of listeners) listener();
    });
    source.addEventListener("open", () => _set_stream_status("online"));
    source.addEventListener("error", () => _set_stream_status("offline"));
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

function useTopicVersion(topic_path: string | null): number {
  const [version, set_version] = useState(0);
  useEffect(() => {
    if (topic_path === null) return;
    return subscribe_topic(topic_path, () => set_version(v => v + 1));
  }, [topic_path]);
  return version;
}

/** Global "any match had activity" stream — Home Match Center uses it. */
export function useMatchesLiveVersion(): number {
  return useTopicVersion("matches");
}

/** Stream connection status shared across every topic — surface in the
 * UI so users see a "live offline" hint rather than silent staleness. */
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
