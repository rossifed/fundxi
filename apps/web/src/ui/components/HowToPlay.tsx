import { useEffect, useState, type ReactNode } from "react";
import { Sheet } from "@/ui/components/Sheet";
import { color } from "@/ui/design/tokens";
import { useViewport } from "@/ui/hooks/use_viewport";

// Self-contained onboarding overlay: a floating "?" launcher + a "How fundXI
// works" panel (centered modal on desktop, bottom sheet on phone, via the shared
// Sheet primitive). It auto-opens ONCE on a browser's first visit, then only on
// demand. Reads no data and touches no other component, so it has zero impact on
// the rest of the app. Pure presentation.
//
// First-run flag persisted in localStorage exactly like the watchlist / fixtures
// view-mode preferences (per-browser, client-only, fine for a UI hint).

const SEEN_KEY = "fundxi:howtoplay:seen";

function already_seen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true; // storage disabled, don't nag, treat as already seen
  }
}

function mark_seen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* storage disabled, non-fatal: the panel just stays available on demand */
  }
}

export function HowToPlay() {
  const { is_mobile } = useViewport();
  const [open, set_open] = useState(false);

  // Auto-open once, on the very first visit only.
  useEffect(() => {
    if (!already_seen()) {
      set_open(true);
      mark_seen();
    }
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => set_open(true)}
        aria-label="How to play"
        title="How to play"
        style={{
          position: "fixed",
          right: 18,
          bottom: is_mobile ? 92 : 22, // raised to clear the mobile BottomNav
          zIndex: 150,
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: "rgba(255,255,255,.06)",
          border: `1px solid ${color.brandGreen}`,
          color: color.brandGreen,
          fontSize: 20,
          fontWeight: 800,
          fontFamily: "inherit",
          cursor: "pointer",
          boxShadow: "0 8px 24px rgba(0,0,0,.4)",
        }}
      >
        ?
      </button>

      <Sheet
        open={open}
        on_close={() => set_open(false)}
        max_width={460}
        footer={
          <button
            type="button"
            onClick={() => set_open(false)}
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
            Got it, let's play
          </button>
        }
      >
        <div style={{ padding: "26px 22px 6px", color: "#fff" }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>How fundXI works</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.55)", marginTop: 4, marginBottom: 18 }}>
            New here? Here is the game in one minute.
          </div>

          <Step
            n={1}
            title="The goal"
            body="You start with play money in euros, shown in millions (like €10M). You spend it on shares of real World Cup players, like tiny stocks. When your players do well, their value rises and you climb your league."
          />

          <Step n={2} title="How to play">
            <Bullet label="Buy" text="open a player and tap Buy, then choose how much of your cash to put in." />
            <Bullet
              label="Buy many"
              text="in the Screener, filter the list and buy all of them at once. Or open a team and buy the whole squad in one tap."
            />
            <Bullet label="Sell" text="tap Sell any time to bank a gain or stop a loss." />
          </Step>

          <Step n={3} title="When prices move">
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              <Pill tone="up" label="Goes up" text="he scores, makes an assist, plays well, or his team wins." />
              <Pill tone="down" label="Goes down" text="he plays badly, sits on the bench, or his team goes out." />
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,.6)", marginTop: 10, lineHeight: 1.5 }}>
              During a live match, prices move in real time. That is the fun part.
            </div>
          </Step>

          <Step n={4} title="The five tabs">
            <Bullet label="Home" text="what is hot right now: news and the biggest movers." />
            <Bullet label="Screener" text="the full list of players. Search and filter to find who to buy." />
            <Bullet label="Fixtures" text="the match schedule. Tap a match to follow it live." />
            <Bullet label="Portfolio" text="your players, your cash, and how you are doing." />
            <Bullet label="Leagues" text="create or join a league to play against your friends." />
          </Step>

          <div
            style={{
              marginTop: 8,
              padding: "12px 14px",
              background: "rgba(255,255,255,.03)",
              border: "1px solid rgba(255,255,255,.06)",
              borderRadius: 10,
              fontSize: 13,
              color: "rgba(255,255,255,.7)",
              lineHeight: 1.5,
            }}
          >
            <b style={{ color: "#fff" }}>Start here:</b> open the Screener, pick two or three players you
            like, then watch their matches.
          </div>
        </div>
      </Sheet>
    </>
  );
}

function Step({ n, title, body, children }: { n: number; title: string; body?: string; children?: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
      <div
        style={{
          flexShrink: 0,
          width: 26,
          height: 26,
          borderRadius: "50%",
          background: "color-mix(in srgb, var(--color-positive) 14%, transparent)",
          color: "var(--color-positive)",
          fontSize: 13,
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {n}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>
        {body && (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.6)", marginTop: 3, lineHeight: 1.5 }}>{body}</div>
        )}
        {children}
      </div>
    </div>
  );
}

// One labelled line (bold label, then plain text) used by the "How to play"
// actions and the "five tabs" guide.
function Bullet({ label, text }: { label: string; text: string }) {
  return (
    <div style={{ fontSize: 13, lineHeight: 1.5, marginTop: 6, color: "rgba(255,255,255,.6)" }}>
      <span style={{ fontWeight: 700, color: "#fff" }}>{label}</span>
      {"  "}
      {text}
    </div>
  );
}

function Pill({ tone, label, text }: { tone: "up" | "down"; label: string; text: string }) {
  const c = tone === "up" ? "var(--color-positive)" : "var(--color-negative)";
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 13, lineHeight: 1.5 }}>
      <span
        style={{
          flexShrink: 0,
          padding: "2px 8px",
          borderRadius: 6,
          background: `color-mix(in srgb, ${c} 14%, transparent)`,
          color: c,
          fontWeight: 800,
          fontSize: 11,
        }}
      >
        {label}
      </span>
      <span style={{ color: "rgba(255,255,255,.7)" }}>{text}</span>
    </div>
  );
}
