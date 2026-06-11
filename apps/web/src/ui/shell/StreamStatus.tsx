/* StreamStatus — a small live-connection indicator for the shell.
 *
 * DDD role: presentational UI component. Surfaces the shared SSE
 * connection state so a user knows when the figures on screen may be
 * stale (the streaming service is down / unreachable). The app keeps
 * working from the BFF either way — this is the visibility, not a fix.
 */

import { color } from "@/ui/design/tokens";
import { useStreamStatus } from "@/ui/hooks/use_live_updates";

export function StreamStatus() {
  const status = useStreamStatus();
  if (status === "unknown") return null;
  const online = status === "online";

  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px" }}
      title={online ? "Live updates connected" : "Live updates disconnected — showing the last known data"}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 4,
          flexShrink: 0,
          background: online ? color.brandGreen : color.negative,
        }}
      />
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 0.3,
          color: online ? "rgba(255,255,255,.5)" : color.negative,
        }}
      >
        {online ? "Connected" : "Disconnected"}
      </span>
    </div>
  );
}
