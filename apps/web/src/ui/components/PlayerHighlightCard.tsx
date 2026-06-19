/* PlayerHighlightCard — a compact "card of the match" highlight.
 *
 * DDD role: presentational UI component. Reuses the PlayerCard HERO aesthetic
 * (team-colour glow + chart grid + ghost jersey number behind a bottom-anchored
 * portrait + name scrim) WITHOUT the flip / stat-strip / trade machinery. Below
 * the portrait sits a single labelled caption: the reason this player is a
 * highlight (a match stat — value is pre-formatted by the caller).
 *
 * Every value shown is real provider data, resolved by the caller. The card is
 * dumb: it renders identity + caption and reports a tap.
 */

import { useState } from "react";
import type { Position } from "@fundxi/core/domain/player/player";
import { POSITION_ABBR } from "@fundxi/core/domain/player/player";

export interface HighlightCaption {
  /** Category, e.g. "TOP SCORER", "MOST DANGEROUS". Uppercased by the style. */
  label: string;
  /** Pre-formatted headline value, e.g. "+8.3%", "2", "96%", "0.74". */
  value: string;
  /** Optional secondary line, e.g. "1 assist", "2 on target", "80 passes". */
  sub?: string;
  /** Drives the value colour. Defaults to neutral white. */
  tone?: "positive" | "negative" | "neutral";
}

interface PlayerHighlightCardProps {
  name: string;
  jersey_number: number;
  position: Position;
  image_path: string | null;
  /** Per-row provider kit colour (literal interpolation allowed — it's data). */
  team_color: string;
  caption: HighlightCaption;
  on_click: () => void;
}

function last_name(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

const TONE_COLOR: Record<NonNullable<HighlightCaption["tone"]>, string> = {
  positive: "var(--color-positive)",
  negative: "var(--color-negative)",
  neutral: "#fff",
};

export function PlayerHighlightCard({
  name,
  jersey_number,
  position,
  image_path,
  team_color,
  caption,
  on_click,
}: PlayerHighlightCardProps) {
  const [img_failed, set_img_failed] = useState(false);
  const [hover, set_hover] = useState(false);
  const has_photo = image_path !== null && image_path !== "" && !img_failed;
  const value_color = TONE_COLOR[caption.tone ?? "neutral"];

  return (
    <button
      type="button"
      onClick={on_click}
      onMouseEnter={() => set_hover(true)}
      onMouseLeave={() => set_hover(false)}
      title={`Open ${name}`}
      style={{
        flexShrink: 0,
        width: 132,
        display: "flex",
        flexDirection: "column",
        padding: 0,
        borderRadius: 14,
        overflow: "hidden",
        background: "#0b0c11",
        border: "1px solid rgba(255,255,255,.07)",
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left",
        transform: hover ? "translateY(-3px)" : "none",
        boxShadow: hover ? `0 12px 26px rgba(0,0,0,.55), 0 0 16px ${team_color}33` : "0 3px 10px rgba(0,0,0,.4)",
        transition: "transform .15s ease, box-shadow .15s ease",
      }}
    >
      {/* Hero — glow + chart grid + ghost number behind a bottom portrait. */}
      <div
        style={{
          position: "relative",
          aspectRatio: "1 / 1",
          overflow: "hidden",
          background: `radial-gradient(125% 75% at 50% 30%, ${team_color}45, #0b0c11 72%)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent 0 16px, rgba(255,255,255,.02) 16px 17px)," +
              "repeating-linear-gradient(90deg, transparent 0 16px, rgba(255,255,255,.02) 16px 17px)",
          }}
        />
        <span
          className="mono"
          aria-hidden
          style={{
            position: "absolute",
            left: "50%",
            top: has_photo ? "0%" : "50%",
            transform: has_photo ? "translateX(-50%) skewX(-8deg)" : "translate(-50%, -50%) skewX(-8deg)",
            fontSize: 76,
            fontWeight: 900,
            letterSpacing: -5,
            lineHeight: 1,
            color: has_photo ? "transparent" : `${team_color}33`,
            WebkitTextStroke: `1.5px ${team_color}8c`,
            whiteSpace: "nowrap",
            userSelect: "none",
            pointerEvents: "none",
          }}
        >
          {jersey_number}
        </span>
        {has_photo && (
          <img
            src={image_path!}
            alt=""
            onError={() => set_img_failed(true)}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              width: "100%",
              height: "82%",
              objectFit: "contain",
              objectPosition: "bottom center",
              display: "block",
            }}
          />
        )}
        {/* Position chip. */}
        <span
          style={{
            position: "absolute",
            top: 6,
            left: 6,
            background: "rgba(6,7,12,.85)",
            borderRadius: 6,
            padding: "3px 6px",
            fontSize: 8.5,
            fontWeight: 800,
            letterSpacing: 0.6,
            color: "rgba(255,255,255,.85)",
            lineHeight: 1,
          }}
        >
          {POSITION_ABBR[position]}
        </span>
        {/* Name scrim. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding: "20px 8px 6px",
            background: "linear-gradient(to top, rgba(5,6,11,.98) 18%, rgba(5,6,11,.4) 60%, transparent)",
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: -0.2,
              color: "#fff",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {last_name(name)}
          </div>
        </div>
      </div>

      {/* Caption — the highlight reason. Team-colour top rule like PlayerCard. */}
      <div style={{ borderTop: `2px solid ${team_color}`, padding: "7px 9px 8px" }}>
        <div
          style={{
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: 0.8,
            textTransform: "uppercase",
            color: "rgba(255,255,255,.4)",
          }}
        >
          {caption.label}
        </div>
        <div className="mono" style={{ fontSize: 17, fontWeight: 900, letterSpacing: -0.3, color: value_color, marginTop: 2 }}>
          {caption.value}
        </div>
        {caption.sub && (
          <div style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,.4)", marginTop: 1 }}>{caption.sub}</div>
        )}
      </div>
    </button>
  );
}
