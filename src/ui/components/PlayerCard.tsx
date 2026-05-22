/* PlayerCard — vertical, Sorare-style player card.
 *
 * DDD role: presentational UI component. Shows a player as a tradeable
 * asset: portrait, identity, live price + change. Click is the caller's
 * concern (typically: open the PlayerSheet).
 *
 * Colours flow through the design tokens; the only literal here is the
 * per-player team kit colour, which is provider data, not theme (see
 * CLAUDE.md styling rules).
 */

import { useState } from "react";
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
  current_price: number;
  change_pct: number;
  on_click: () => void;
}

export function PlayerCard({
  name,
  jersey_number,
  position,
  image_path,
  team_color,
  current_price,
  change_pct,
  on_click,
}: PlayerCardProps) {
  const [img_failed, set_img_failed] = useState(false);
  const has_photo = image_path !== null && image_path !== "" && !img_failed;

  return (
    <button
      type="button"
      onClick={on_click}
      style={{
        display: "flex",
        flexDirection: "column",
        padding: 0,
        border: "1px solid rgba(255,255,255,.07)",
        borderTop: `2px solid ${team_color}`,
        borderRadius: 10,
        background: "rgba(255,255,255,.025)",
        cursor: "pointer",
        overflow: "hidden",
        fontFamily: "inherit",
        textAlign: "left",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,.05)")}
      onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,.025)")}
    >
      {/* Portrait — real photo, or a team-coloured block with the
          jersey number when the provider has no image. */}
      <div
        style={{
          position: "relative",
          aspectRatio: "1 / 1",
          background: `linear-gradient(160deg, ${team_color}33, rgba(255,255,255,.03))`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {has_photo ? (
          <img
            src={image_path!}
            alt=""
            onError={() => set_img_failed(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <span className="mono" style={{ fontSize: 40, fontWeight: 800, color: "rgba(255,255,255,.55)" }}>
            {jersey_number}
          </span>
        )}
        <span
          className="mono"
          style={{
            position: "absolute",
            top: 6,
            left: 6,
            fontSize: 10,
            fontWeight: 800,
            padding: "2px 6px",
            borderRadius: 5,
            background: "rgba(7,8,29,.85)",
            color: position_color[position],
          }}
        >
          {POSITION_ABBR[position]}
        </span>
      </div>

      {/* Identity + live price */}
      <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 5, minWidth: 0 }}>
          <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.4)", flexShrink: 0 }}>
            {jersey_number}
          </span>
          <span
            style={{
              fontSize: 12.5,
              fontWeight: 700,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              minWidth: 0,
            }}
          >
            {name}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
          <span className="mono" style={{ fontSize: 13, fontWeight: 800 }}>
            {fmt_eur_m(current_price)}
          </span>
          <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: color_for_sign(change_pct) }}>
            {fmt_signed_pct(change_pct, 1)}
          </span>
        </div>
      </div>
    </button>
  );
}
