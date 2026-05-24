/* PlayerCard — a flip trading card for a player.
 *
 * DDD role: presentational UI component. Two faces:
 *  - FRONT: portrait summary (rating-free, real stats, market value).
 *  - BACK: a price sparkline + Buy/Sell that open the shared TradeDialog.
 *
 * The flip is driven by an explicit ``↻`` control — a click on desktop, a
 * tap on mobile, IDENTICAL behaviour. It is deliberately NOT tied to hover:
 * a money action (Buy/Sell) must never live behind a desktop-only gesture
 * (CLAUDE.md mobile-parity rule). Hover stays purely decorative (lift/glow).
 *
 * Every value is real provider data. Nothing FIFA-proprietary (no PAC/SHO,
 * no EA overall, no rarity tier) — see CLAUDE.md Data-Sourcing.
 */

import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { Position } from "@fundxi/core/domain/player/player";
import { POSITION_ABBR } from "@fundxi/core/domain/player/player";
import { Spark } from "@/ui/components/Spark";
import { color } from "@/ui/design/tokens";
import { color_for_sign, fmt_eur_m, fmt_signed_pct } from "@/ui/helpers/format";

export interface PlayerCardStats {
  minutes_played: number | null;
  goals: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
}

interface PlayerCardProps {
  name: string;
  jersey_number: number;
  position: Position;
  image_path: string | null;
  team_color: string;
  age: number | null;
  height: number | null; // cm
  weight: number | null; // kg
  current_price: number;
  change_pct: number; // P&L % since tournament start
  stats: PlayerCardStats | null;
  spark_data: number[]; // fixed-length price sparkline for the back face
  on_click: () => void;
  on_trade: (kind: "buy" | "sell") => void;
}

/** Count-style stat -> always a number (null means "played, none"). */
function n(v: number | null | undefined): string {
  return String(v ?? 0);
}

/** Split a display name into a small first part + a bold last name. */
function split_name(name: string): { first: string | null; last: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return { first: null, last: name.trim() };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1]! };
}

export function PlayerCard({
  name,
  jersey_number,
  position,
  image_path,
  team_color,
  age,
  height,
  weight,
  current_price,
  change_pct,
  stats,
  spark_data,
  on_click,
  on_trade,
}: PlayerCardProps) {
  const [img_failed, set_img_failed] = useState(false);
  const [hover, set_hover] = useState(false);
  const [flipped, set_flipped] = useState(false);
  const has_photo = image_path !== null && image_path !== "" && !img_failed;

  const { first, last } = split_name(name);

  const bio = [
    age != null ? `${age}Y` : null,
    height != null ? `${height}CM` : null,
    weight != null ? `${weight}KG` : null,
  ].filter((x): x is string => x !== null);

  const booking_glyph = (fill: string): CSSProperties => ({
    width: 9,
    height: 12,
    borderRadius: 2,
    background: fill,
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,.35), 0 1px 2px rgba(0,0,0,.5)",
  });

  const stat_cells: { label: ReactNode; value: string }[] = [
    { label: <StatLabel>MIN</StatLabel>, value: n(stats?.minutes_played) },
    { label: <StatLabel>GLS</StatLabel>, value: n(stats?.goals) },
    { label: <span style={booking_glyph(color.cardYellow)} />, value: n(stats?.yellow_cards) },
    { label: <span style={booking_glyph(color.negative)} />, value: n(stats?.red_cards) },
  ];

  const overlay_chip: CSSProperties = {
    background: "rgba(6,7,12,.85)",
    borderRadius: 7,
    lineHeight: 1,
  };

  // Metallic frame — a diagonal sheen from the team kit colour (per-card
  // provider data, so the literal interpolation is allowed).
  const frame_gradient =
    `linear-gradient(150deg, ${team_color} 0%, ${team_color}40 17%, ${team_color}0d 33%, ` +
    `${team_color}59 50%, ${team_color}0d 67%, ${team_color}59 84%, ${team_color} 100%)`;

  // Shared face shells — both faces are a complete framed card.
  const face_frame: CSSProperties = {
    padding: 2,
    borderRadius: 16,
    background: frame_gradient,
    WebkitBackfaceVisibility: "hidden",
    backfaceVisibility: "hidden",
  };
  const face_body: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    borderRadius: 14,
    background: "#0b0c11",
    overflow: "hidden",
    height: "100%",
  };

  const corner_button: CSSProperties = {
    width: 24,
    height: 24,
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1,
    color: "#fff",
    background: "rgba(6,7,12,.85)",
    border: `1px solid ${team_color}66`,
    cursor: "pointer",
    fontFamily: "inherit",
    flexShrink: 0,
  };

  const action_button = (bg: string, fg: string): CSSProperties => ({
    flex: 1,
    padding: "9px 0",
    border: "none",
    borderRadius: 9,
    background: bg,
    color: fg,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.6,
    cursor: "pointer",
    fontFamily: "inherit",
  });

  return (
    <div
      onMouseEnter={() => set_hover(true)}
      onMouseLeave={() => set_hover(false)}
      style={{
        perspective: 1400,
        borderRadius: 16,
        transform: hover ? "translateY(-5px)" : "none",
        boxShadow: hover
          ? `0 18px 38px rgba(0,0,0,.62), 0 0 22px ${team_color}40`
          : "0 4px 14px rgba(0,0,0,.5)",
        transition: "transform .16s ease, box-shadow .16s ease",
      }}
    >
      <div
        style={{
          position: "relative",
          transformStyle: "preserve-3d",
          transition: "transform .55s cubic-bezier(.2,.75,.2,1)",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* ---- FRONT ------------------------------------------------- */}
        <div onClick={on_click} style={{ ...face_frame, position: "relative", cursor: "pointer" }}>
          <div style={face_body}>
            {/* Hero — designed stage: chart-grid + ghost number behind a
                reduced, bottom-anchored portrait. */}
            <div
              style={{
                position: "relative",
                aspectRatio: "3 / 4",
                overflow: "hidden",
                background: `radial-gradient(125% 75% at 50% 32%, ${team_color}45, #0b0c11 72%)`,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage:
                    "repeating-linear-gradient(0deg, transparent 0 18px, rgba(255,255,255,.02) 18px 19px)," +
                    "repeating-linear-gradient(90deg, transparent 0 18px, rgba(255,255,255,.02) 18px 19px)",
                }}
              />

              <span
                className="mono"
                style={{
                  position: "absolute",
                  left: "50%",
                  top: has_photo ? "2%" : "50%",
                  transform: has_photo
                    ? "translateX(-50%) skewX(-8deg)"
                    : "translate(-50%, -50%) skewX(-8deg)",
                  fontSize: 96,
                  fontWeight: 900,
                  letterSpacing: -6,
                  lineHeight: 1,
                  color: has_photo ? "transparent" : `${team_color}33`,
                  WebkitTextStroke: `2px ${team_color}8c`,
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
                    height: "72%",
                    objectFit: "contain",
                    objectPosition: "bottom center",
                    display: "block",
                  }}
                />
              )}

              {/* Top-left — position. */}
              <span
                style={{
                  ...overlay_chip,
                  position: "absolute",
                  top: 8,
                  left: 8,
                  padding: "4px 7px",
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: 0.7,
                  color: "rgba(255,255,255,.85)",
                }}
              >
                {POSITION_ABBR[position]}
              </span>

              {/* Top-right — flip to the chart + trade face. */}
              <button
                type="button"
                aria-label="Show chart and trade"
                onClick={e => {
                  e.stopPropagation();
                  set_flipped(true);
                }}
                style={{ ...corner_button, position: "absolute", top: 8, right: 8 }}
              >
                ↻
              </button>

              {/* Name scrim. */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  padding: "32px 11px 9px",
                  background:
                    "linear-gradient(to top, rgba(5,6,11,.98) 14%, rgba(5,6,11,.5) 55%, transparent)",
                }}
              >
                {first && (
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: 0.8,
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,.55)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      marginBottom: 1,
                    }}
                  >
                    {first}
                  </div>
                )}
                <div
                  style={{
                    fontSize: 17,
                    fontWeight: 800,
                    letterSpacing: -0.2,
                    color: "#fff",
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {last}
                </div>
              </div>
            </div>

            {/* Stat strip. */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                background: "rgba(255,255,255,.025)",
                borderBottom: "1px solid rgba(255,255,255,.05)",
              }}
            >
              {stat_cells.map((c, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    padding: "8px 2px",
                    borderLeft: i === 0 ? "none" : "1px solid rgba(255,255,255,.04)",
                  }}
                >
                  <span style={{ height: 12, display: "flex", alignItems: "center" }}>{c.label}</span>
                  <span className="mono" style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>
                    {c.value}
                  </span>
                </div>
              ))}
            </div>

            {/* Physical line. */}
            {bio.length > 0 && (
              <div
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  color: "rgba(255,255,255,.42)",
                  textAlign: "center",
                  padding: "6px",
                  borderBottom: "1px solid rgba(255,255,255,.05)",
                }}
              >
                {bio.join("  ·  ")}
              </div>
            )}

            {/* Market footer. */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderTop: `2px solid ${team_color}`,
                padding: "9px 11px",
              }}
            >
              <div>
                <div className="mono" style={{ fontSize: 17, fontWeight: 900, letterSpacing: -0.3, color: "#fff" }}>
                  {fmt_eur_m(current_price)}
                </div>
                <div style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: 1, color: "rgba(255,255,255,.35)", marginTop: 2 }}>
                  MARKET VALUE
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="mono" style={{ fontSize: 13, fontWeight: 800, color: color_for_sign(change_pct) }}>
                  {change_pct > 0 ? "▲ " : change_pct < 0 ? "▼ " : ""}
                  {fmt_signed_pct(change_pct, 1)}
                </div>
                <div style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: 1, color: "rgba(255,255,255,.35)", marginTop: 2 }}>
                  SINCE START
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ---- BACK -------------------------------------------------- */}
        <div
          style={{
            ...face_frame,
            position: "absolute",
            inset: 0,
            transform: "rotateY(180deg)",
          }}
        >
          <div style={{ ...face_body, padding: "12px", gap: 11, justifyContent: "space-between" }}>
            {/* Header — identity + flip back. */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  ...overlay_chip,
                  padding: "4px 7px",
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: 0.7,
                  color: "rgba(255,255,255,.85)",
                  border: `1px solid ${team_color}66`,
                }}
              >
                {POSITION_ABBR[position]}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: "#fff",
                    textTransform: "uppercase",
                    letterSpacing: -0.2,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {last}
                </div>
                {first && (
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      letterSpacing: 0.6,
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,.45)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {first}
                  </div>
                )}
              </div>
              <button
                type="button"
                aria-label="Back to card"
                onClick={e => {
                  e.stopPropagation();
                  set_flipped(false);
                }}
                style={corner_button}
              >
                ✕
              </button>
            </div>

            {/* Performance sparkline. */}
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                background: "rgba(255,255,255,.02)",
                border: "1px solid rgba(255,255,255,.05)",
                borderRadius: 10,
                padding: "10px 0",
                overflow: "hidden",
              }}
            >
              <Spark data={spark_data} color={color_for_sign(change_pct)} width={140} height={56} />
              <span
                className="mono"
                style={{ fontSize: 13, fontWeight: 800, color: color_for_sign(change_pct) }}
              >
                {change_pct > 0 ? "▲ " : change_pct < 0 ? "▼ " : ""}
                {fmt_signed_pct(change_pct, 1)}
              </span>
              <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: 1, color: "rgba(255,255,255,.35)" }}>
                PRICE · SINCE START
              </span>
            </div>

            {/* Live price. */}
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <span className="mono" style={{ fontSize: 19, fontWeight: 900, letterSpacing: -0.3, color: "#fff" }}>
                {fmt_eur_m(current_price)}
              </span>
              <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: "rgba(255,255,255,.35)" }}>
                MARKET VALUE
              </span>
            </div>

            {/* Buy / Sell — opens the shared TradeDialog. */}
            <div style={{ display: "flex", gap: 7 }}>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  on_trade("buy");
                }}
                style={action_button(color.actionBuy, color.bg)}
              >
                BUY
              </button>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  on_trade("sell");
                }}
                style={action_button(color.actionSell, "#fff")}
              >
                SELL
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatLabel({ children }: { children: string }) {
  return (
    <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.4, color: "rgba(255,255,255,.4)" }}>
      {children}
    </span>
  );
}
