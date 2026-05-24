// Streaming service base URL (Server-Sent Events). Separate from the BFF
// (VITE_API_URL) because the streaming service is a distinct process —
// see backend/src/streaming/. Defaults to the local dev port.
//
// DDD role: Adapter config. The UI never talks to NATS or the BFF for
// live updates — it opens an EventSource against this base URL.

const STREAM_BASE: string =
  (import.meta.env.VITE_STREAM_URL as string | undefined) ?? "http://localhost:8002";

/** URL of an SSE topic stream, e.g. stream_url("fixture/42"). */
export function stream_url(topic_path: string): string {
  return `${STREAM_BASE}/streams/${topic_path}`;
}
