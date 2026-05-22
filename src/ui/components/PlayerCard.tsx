/* PlayerCard — a portrait trading card for a player.
 *
 * DDD role: presentational UI component. FUT-inspired layout (rating
 * badge, hero portrait, a 6-stat block, a market-value band) but in
 * fundXI's palette: dark surfaces, the team kit colour as the frame
 * accent (per-card provider data, not theme), green/red for the change.
 *
 * Every value is real: the rating, the 6 stats, age/height/weight/foot,
 * the market value. Nothing FIFA-proprietary (no PAC/SHO/… attributes,
 * no EA overall, no rarity tier) — see CLAUDE.md Data-Sourcing.
 */

import { useState } from "react";
import type { CSSProperties } from "react";
import type { Position } from "@/domain/player/player";
import { POSITION_ABBR } from "@/domain/player/player";
import { color_for_sign, fmt_eur_m, fmt_signed_pct } from "@/ui/helpers/format";
import { position_color } from "@/ui/design/tokens";

export interface PlayerCardStats {
  appearances: number | null;
  minutes_played: number | null;
  goals: number | null;
  assists: number | null;
  passes_accuracy: number | null;
  rating_avg: number | null;
}

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
  stats: PlayerCardStats | null;
  on_click: () => void;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

/** Count-style stat -> always a number (null means "played, none"). */
function n(v: number | null | undefined): string {
  return String(v ?? 0);
}

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
  stats,
  on_click,
}: PlayerCardProps) {
  const [img_failed, set_img_failed] = useState(false);
  const [hover, set_hover] = useState(false);
  const has_photo = image_path !== null && image_path !== "" && !img_failed;

  const rating = stats?.rating_avg;
  const bio = [
    age != null ? `${age}y` : null,
    height != null ? `${height}cm` : null,
    weight != null ? `${weight}kg` : null,
    foot ? capitalize(foot) : null,
  ].filter((x): x is string => x !== null);

  // The 6-stat block — real tournament figures.
  const stat_cells: { label: string; value: string }[] = [
    { label: "G", value: n(stats?.goals) },
    { label: "A", value: n(stats?.assists) },
    { label: "APP", value: n(stats?.appearances) },
    { label: "MIN", value: n(stats?.minutes_played) },
    { label: "PAS%", value: stats?.passes_accuracy != null ? `${Math.round(stats.passes_accuracy)}` : "—" },
    { label: "RAT", value: stats?.rating_avg != null ? stats.rating_avg.toFixed(1) : "—" },
  ];

  const overlay_chip: CSSProperties = {
    background: "rgba(6,7,12,.78)",
    backdropFilter: "blur(3px)",
    borderRadius: 7,
    lineHeight: 1,
  };

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
        border: `1.5px solid ${hover ? team_color : `${team_color}66`}`,
        borderRadius: 14,
        background: "#0b0c11",
        cursor: "pointer",
        overflow: "hidden",
        fontFamily: "inherit",
        textAlign: "left",
        transform: hover ? "translateY(-4px)" : "none",
        boxShadow: hover
          ? `0 16px 34px rgba(0,0,0,.6), 0 0 0 1px ${team_color}44`
          : "0 2px 10px rgba(0,0,0,.4)",
        transition: "transform .16s ease, box-shadow .16s ease, border-color .16s ease",
      }}
    >
      {/* Hero — portrait photo with corner overlays + a name scrim. */}
      <div
        style={{
          position: "relative",
          aspectRatio: "3 / 4",
          background: `radial-gradient(125% 80% at 50% 12%, ${team_color}66, #0b0c11 72%)`,
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
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span className="mono" style={{ fontSize: 64, fontWeight: 900, color: "rgba(255,255,255,.26)" }}>
              {jersey_number}
            </span>
          </div>
        )}

        {/* Top-left — rating headline + position. */}
        <div style={{ position: "absolute", top: 8, left: 8, display: "flex", flexDirection: "column", gap: 3 }}>
          <span
            style={{
              ...overlay_chip,
              padding: "3px 8px",
              fontSize: 17,
              fontWeight: 900,
              letterSpacing: -0.5,
              color: team_color,
              textAlign: "center",
            }}
          >
            {rating != null ? rating.toFixed(1) : "—"}
          </span>
          <span
            style={{
              ...overlay_chip,
              padding: "3px 6px",
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: 0.6,
              color: position_color[position],
              textAlign: "center",
            }}
          >
            {POSITION_ABBR[position]}
          </span>
        </div>

        {/* Top-right — jersey + change. */}
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            display: "flex",
            flexDirection: "column",
            gap: 3,
            alignItems: "flex-end",
          }}
        >
          <span
            className="mono"
            style={{ ...overlay_chip, padding: "3px 7px", fontSize: 12, fontWeight: 800, color: "#fff" }}
          >
            {jersey_number}
          </span>
          <span
            className="mono"
            style={{
              ...overlay_chip,
              padding: "3px 7px",
              fontSize: 10,
              fontWeight: 800,
              color: color_for_sign(change_pct),
            }}
          >
            {fmt_signed_pct(change_pct, 1)}
          </span>
        </div>

        {/* Name scrim. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding: "30px 11px 9px",
            background: "linear-gradient(to top, rgba(5,6,11,.97) 16%, rgba(5,6,11,.55) 58%, transparent)",
          }}
        >
          <div
            style={{
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: -0.2,
              color: "#fff",
              textTransform: "uppercase",
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

      {/* 6-stat block — abbreviation over value, FUT-style. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          background: "rgba(255,255,255,.03)",
          borderBottom: "1px solid rgba(255,255,255,.05)",
        }}
      >
        {stat_cells.map((c, i) => (
          <div
            key={c.label}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1,
              padding: "7px 2px",
              borderLeft: i === 0 ? "none" : "1px solid rgba(255,255,255,.04)",
            }}
          >
            <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.3, color: "rgba(255,255,255,.4)" }}>
              {c.label}
            </span>
            <span className="mono" style={{ fontSize: 12, fontWeight: 800, color: "#fff" }}>
              {c.value}
            </span>
          </div>
        ))}
      </div>

      {/* Physical line. */}
      {bio.length > 0 && (
        <div
          style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: 0.2,
            color: "rgba(255,255,255,.4)",
            textAlign: "center",
            padding: "5px 6px",
            borderBottom: "1px solid rgba(255,255,255,.05)",
          }}
        >
          {bio.join("  ·  ")}
        </div>
      )}

      {/* Market value band — team-colour accent on top. */}
      <div style={{ borderTop: `2px solid ${team_color}`, padding: "8px 11px", textAlign: "center" }}>
        <div className="mono" style={{ fontSize: 16, fontWeight: 900, letterSpacing: -0.3, color: "#fff" }}>
          {fmt_eur_m(current_price)}
        </div>
        <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: "rgba(255,255,255,.35)", marginTop: 1 }}>
          MARKET VALUE
        </div>
      </div>
    </button>
  );
}
