/* PlayerCard — a portrait trading card for a player.
 *
 * DDD role: presentational UI component. The player as a tradeable
 * asset: a full-bleed portrait hero, identity overlaid on a gradient
 * scrim, then the market value + tournament change and the physical
 * profile. Click is the caller's concern (open the PlayerSheet).
 *
 * Colours flow through design tokens; the only literals are the
 * per-player team kit colour (provider data, not theme) and the
 * black scrim overlays (theme-agnostic on a dark UI — see CLAUDE.md).
 */

import { useState } from "react";
import type { CSSProperties } from "react";
import type { Position } from "@/domain/player/player";
import { POSITION_ABBR } from "@/domain/player/player";
import { color_for_sign, fmt_eur_m, fmt_signed_pct } from "@/ui/helpers/format";
import { position_color } from "@/ui/design/tokens";

interface PlayerCardProps {
  name: string;
  jersey_number: number;
  position: Position;
  image_path: string | null;
  team_color: string;
  club: string | null;
  age: number | null;
  foot: string | null;
  height: number | null; // cm
  weight: number | null; // kg
  current_price: number;
  change_pct: number; // % since tournament start
  on_click: () => void;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

const CHIP: CSSProperties = {
  position: "absolute",
  top: 8,
  fontSize: 10,
  fontWeight: 800,
  padding: "3px 7px",
  borderRadius: 6,
  background: "rgba(7,8,29,.82)",
  backdropFilter: "blur(3px)",
  lineHeight: 1,
};

export function PlayerCard({
  name,
  jersey_number,
  position,
  image_path,
  team_color,
  club,
  age,
  foot,
  height,
  weight,
  current_price,
  change_pct,
  on_click,
}: PlayerCardProps) {
  const [img_failed, set_img_failed] = useState(false);
  const [hover, set_hover] = useState(false);
  const has_photo = image_path !== null && image_path !== "" && !img_failed;

  // Compact physical line — only the parts the provider actually gave.
  const bio = [
    age != null ? `${age}y` : null,
    height != null ? `${height}cm` : null,
    weight != null ? `${weight}kg` : null,
    foot ? capitalize(foot) : null,
  ].filter((x): x is string => x !== null);

  const up = change_pct >= 0;

  return (
    <button
      type="button"
      onClick={on_click}
      onMouseEnter={() => set_hover(true)}
      onMouseLeave={() => set_hover(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        padding: 0,
        border: `1px solid ${hover ? `${team_color}88` : "rgba(255,255,255,.09)"}`,
        borderRadius: 14,
        background: "#0c0d12",
        cursor: "pointer",
        overflow: "hidden",
        fontFamily: "inherit",
        textAlign: "left",
        transform: hover ? "translateY(-4px)" : "none",
        boxShadow: hover
          ? "0 14px 32px rgba(0,0,0,.55)"
          : "0 2px 8px rgba(0,0,0,.35)",
        transition: "transform .16s ease, box-shadow .16s ease, border-color .16s ease",
      }}
    >
      {/* Hero — full-bleed portrait. Real photo, or a team-coloured
          panel with the jersey number when the provider has none. */}
      <div
        style={{
          position: "relative",
          aspectRatio: "4 / 5",
          background: `radial-gradient(120% 80% at 50% 0%, ${team_color}55, #0c0d12 70%)`,
        }}
      >
        {has_photo ? (
          <img
            src={image_path!}
            alt=""
            onError={() => set_img_failed(true)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "top center",
              display: "block",
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span className="mono" style={{ fontSize: 60, fontWeight: 900, color: "rgba(255,255,255,.30)" }}>
              {jersey_number}
            </span>
          </div>
        )}

        {/* Corner chips */}
        <span style={{ ...CHIP, left: 8, color: position_color[position] }}>
          {POSITION_ABBR[position]}
        </span>
        <span style={{ ...CHIP, right: 8, color: "rgba(255,255,255,.92)", minWidth: 22, textAlign: "center" }}>
          {jersey_number}
        </span>

        {/* Bottom scrim — name + club ride on top of the photo. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding: "26px 11px 9px",
            background: "linear-gradient(to top, rgba(5,6,12,.96) 18%, rgba(5,6,12,.55) 60%, transparent)",
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: -0.2,
              color: "#fff",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {name}
          </div>
          {club && (
            <div
              title={club}
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "rgba(255,255,255,.5)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                marginTop: 1,
              }}
            >
              {club}
            </div>
          )}
        </div>
      </div>

      {/* Stat panel — market value headline + physical line. */}
      <div style={{ padding: "9px 11px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
          <span className="mono" style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.3 }}>
            {fmt_eur_m(current_price)}
          </span>
          <span
            className="mono"
            title="Change since tournament start"
            style={{ fontSize: 11.5, fontWeight: 700, color: color_for_sign(change_pct) }}
          >
            {up ? "▲" : "▼"} {fmt_signed_pct(change_pct, 1)}
          </span>
        </div>
        {bio.length > 0 && (
          <div
            style={{
              fontSize: 9.5,
              fontWeight: 600,
              letterSpacing: 0.2,
              color: "rgba(255,255,255,.4)",
              borderTop: "1px solid rgba(255,255,255,.05)",
              paddingTop: 6,
            }}
          >
            {bio.join("  ·  ")}
          </div>
        )}
      </div>
    </button>
  );
}
