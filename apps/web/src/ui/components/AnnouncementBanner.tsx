import { useEffect, useState } from "react";
import { announcements_api, type Announcement } from "@fundxi/core/api/announcements_api";
import { Sheet } from "@/ui/components/Sheet";
import { useAuth } from "@/ui/shell/AuthContext";

// Shows pushed in-app announcements to a SIGNED-IN user, one at a time, as a
// dismissible sheet (same primitive as HowToPlay). "Got it" (or closing) acks the
// message server-side, so it never reappears for that account on any device. The
// list endpoint already excludes acked ones. Mounted once at the app root; reads
// only when authenticated. Errors are swallowed — analytics-grade, never blocks UI.

export function AnnouncementBanner() {
  const { user } = useAuth();
  const [queue, set_queue] = useState<Announcement[]>([]);

  useEffect(() => {
    if (!user) {
      set_queue([]);
      return;
    }
    let cancelled = false;
    announcements_api
      .list()
      .then(items => {
        if (!cancelled) set_queue(items);
      })
      .catch(() => {
        /* non-fatal: announcements are a nicety, never block the app */
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const current = queue[0];
  if (!current) return null;

  const dismiss = () => {
    announcements_api.ack(current.id).catch(() => {});
    set_queue(q => q.slice(1));
  };

  return (
    <Sheet
      open
      on_close={dismiss}
      max_width={460}
      footer={
        <button
          type="button"
          onClick={dismiss}
          style={{
            width: "100%",
            padding: "12px 16px",
            background: "var(--color-action-buy)",
            color: "#0d0d0f",
            border: "none",
            borderRadius: 8,
            fontWeight: 800,
            fontSize: 14,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Got it
        </button>
      }
    >
      <div style={{ padding: "26px 22px 8px", color: "#fff" }}>
        {current.severity === "important" && (
          <span
            style={{
              display: "inline-block",
              marginBottom: 10,
              padding: "2px 8px",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              background: "color-mix(in srgb, var(--color-accent) 16%, transparent)",
              color: "var(--color-accent)",
            }}
          >
            Update
          </span>
        )}
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.4 }}>{current.title}</div>
        <div
          style={{
            marginTop: 10,
            fontSize: 14,
            lineHeight: 1.55,
            color: "rgba(255,255,255,.8)",
            whiteSpace: "pre-wrap",
          }}
        >
          {current.body}
        </div>
      </div>
    </Sheet>
  );
}
