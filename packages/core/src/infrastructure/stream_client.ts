// Streaming service base URL (Server-Sent Events). Distinct process from the
// BFF — see backend/src/streaming/. Defaults to the local dev port; each app
// overrides via `set_stream_base` at boot (web from `VITE_STREAM_URL`, mobile
// from `EXPO_PUBLIC_STREAM_URL`). Keeping the platform read out of `core`
// lets Metro load this without choking on `import.meta`.
//
// DDD role: Adapter config. The UI never talks to NATS or the BFF for live
// updates — it opens an EventSource against this base URL.

let _stream_base = "http://localhost:8002";

export function set_stream_base(url: string): void {
  _stream_base = url;
}

export function get_stream_base(): string {
  return _stream_base;
}

/** URL of an SSE topic stream, e.g. `stream_url("fixture/42")`. */
export function stream_url(topic_path: string): string {
  return `${_stream_base}/streams/${topic_path}`;
}
