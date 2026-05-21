// Tactical pitch view — broadcast camera placed behind the home goal,
// looking up-field. The pitch is rendered as a *baked-in trapezoid* in SVG:
// the near goal line (home, at the bottom) is wide and close to the camera,
// the far goal line (away, at the top) is narrow and recedes into the
// distance. All lines and player tokens are positioned through a single
// projection function (no CSS perspective hacks — fully deterministic).

import { useMemo, useState } from "react";
import type { Match, MatchPlayer } from "@/domain/match/match";
import { compute_pitch_positions, type PitchPosition } from "@/domain/match/formation_layout";
import { players_api } from "@/api/players_api";
import { teams_api } from "@/api/teams_api";
import { fmt_eur_m, fmt_signed_pct } from "@/ui/helpers/format";
import { count_match_events, MatchEventBadge, SubBadge, type MatchEventCounts } from "./event_badge";
import { apply_subs, type SubInfo } from "@/domain/match/substitutions";

// SVG canvas. Aspect ≈ 1.6:1 — landscape, slightly taller for breathing room.
const SVG_W = 200;
const SVG_H = 125;

// Trapezoid anchors (in SVG units). Broadcast camera placed behind the near
// goal at moderate height — enough perspective to read depth, but the far
// end stays generously wide so tokens up there are legible. Pitch fills
// the canvas left-to-right and uses the full vertical range.
const TRAP_TOP_Y = 16;
const TRAP_BOT_Y = 120;
const TRAP_TOP_HALF_W = 44; // pitch is 88 units wide at the far goal
const TRAP_BOT_HALF_W = 99; // pitch is 198 units wide at the near goal
const TRAP_CX = SVG_W / 2;

// Real-world pitch dimensions (m) — used to compute the *proportions* of
// the FIFA markings. The marking sizes are absolute IFAB constants, so a
// 120 × 80 pitch ends up with proportionally smaller boxes than a 105 × 68
// one. We use the IFAB max (120 × 80).
const PITCH_W_M = 80;
const PITCH_L_M = 120;
const PEN_BOX_W_M = 40.32;
const PEN_BOX_H_M = 16.5;
const GOAL_BOX_W_M = 18.32;
const GOAL_BOX_H_M = 5.5;
const PEN_SPOT_DIST_M = 11;
const CIRCLE_R_M = 9.15;

// Pre-computed pitch-unit deltas (fractions of pitch width / length).
const PEN_BOX_U = PEN_BOX_W_M / PITCH_W_M; // 0.504
const PEN_BOX_V = PEN_BOX_H_M / PITCH_L_M; // 0.1375
const GOAL_BOX_U = GOAL_BOX_W_M / PITCH_W_M; // 0.229
const GOAL_BOX_V = GOAL_BOX_H_M / PITCH_L_M; // 0.0458
const PEN_SPOT_V = PEN_SPOT_DIST_M / PITCH_L_M; // 0.0917
const CIRCLE_U = CIRCLE_R_M / PITCH_W_M; // 0.114
const CIRCLE_V = CIRCLE_R_M / PITCH_L_M; // 0.0763

// Project pitch coordinates (u, v) ∈ [0,1]² to SVG screen coordinates.
// u: across the pitch width (0 = left touchline, 1 = right touchline).
// v: along the pitch length (0 = far goal / away, 1 = near goal / home).
function p_y(v: number): number {
  return TRAP_TOP_Y + v * (TRAP_BOT_Y - TRAP_TOP_Y);
}
function half_w_at(v: number): number {
  return TRAP_TOP_HALF_W + v * (TRAP_BOT_HALF_W - TRAP_TOP_HALF_W);
}
function p_x(u: number, v: number): number {
  return TRAP_CX + (u - 0.5) * 2 * half_w_at(v);
}

// Token scale by depth — far players smaller (perspective). With the lower
// camera angle the depth gap reads more, so the size gap follows.
function token_scale(v: number): number {
  return 0.68 + 0.42 * v; // 0.68 (far) → 1.10 (near). Less aggressive than the
  // pitch perspective itself — pure geometric scaling would shrink far tokens
  // to thumbnails; we keep them legible at the cost of strict realism.
  // Nudged up ~10% over the original 0.62→1.0 for better readability.
}

// Visual constants — dark surface with a touch of warmth, white markings.
const LINE = "rgba(255,255,255,.32)";
const LINE_FAINT = "rgba(255,255,255,.18)";
const STROKE = 0.45;
const TOUCHLINE_STROKE = 0.75;
const STRIPE_COUNT = 6; // alternating bands across the pitch length

const POS = "var(--color-positive)";
const NEG = "var(--color-negative)";

function fmt_pct_token(v: number): string {
  return `${fmt_signed_pct(v, 1)}`;
}

const TEAM_SELECT_STORAGE_KEY = "fundxi.pitch.team_select";

export function PitchView({
  match,
  subs,
  on_open_player,
  home_color,
  away_color,
}: {
  match: Match;
  /** Per-player sub annotations (computed once at the MatchView
   * level). Drives the swap on the pitch + the sub badge on the
   * entering player. Same map fed to the list view → no drift. */
  subs?: Map<number, SubInfo>;
  on_open_player: (player_id: number) => void;
  home_color?: string;
  away_color?: string;
}) {
  const [team_select, set_team_select] = useState<"home" | "away">(() => {
    if (typeof window === "undefined") return "home";
    const v = window.localStorage.getItem(TEAM_SELECT_STORAGE_KEY);
    return v === "away" ? "away" : "home";
  });

  const select = (t: "home" | "away") => {
    set_team_select(t);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TEAM_SELECT_STORAGE_KEY, t);
    }
  };

  // Effective on-field XI per team: starters with subbed-off players
  // REPLACED by the entering subs (inheriting their formation slot so
  // the pitch shape stays consistent). Same helper as the list view.
  const empty_subs = useMemo<Map<number, SubInfo>>(() => new Map(), []);
  const effective_subs = subs ?? empty_subs;
  const home_xi = useMemo(
    () =>
      apply_subs(
        match.home_xi.filter((x): x is MatchPlayer => typeof x !== "number"),
        match.home_bench ?? [],
        effective_subs,
      ).on_field,
    [match.home_xi, match.home_bench, effective_subs],
  );
  const away_xi = useMemo(
    () => apply_subs(match.away_xi, match.away_bench ?? [], effective_subs).on_field,
    [match.away_xi, match.away_bench, effective_subs],
  );

  const selected_xi = team_select === "home" ? home_xi : away_xi;
  const selected_formation =
    team_select === "home" ? match.home_formation : match.away_formation;

  // Single-team rendering. We still pass the team's REAL broadcast role
  // (home / away) because the Sportmonks column numbering is broadcast-
  // anchored, not team-relative: the layout resolver needs it to flip
  // x correctly so "team's right" ends up on screen's right. The
  // single_team flag tells the resolver to stretch the team across the
  // full pitch length and to apply the x-mirror for the home team.
  const positions = useMemo(
    () => compute_pitch_positions(selected_xi, selected_formation, team_select, { single_team: true }),
    [selected_xi, selected_formation, team_select],
  );

  // Per-player event tally — built by the shared helper so Pitch and
  // List views can never display different counts/icons.
  const event_counts = useMemo(() => count_match_events(match.events), [match.events]);

  const home_fill = home_color ?? match.home_kit_color ?? "rgba(255,255,255,.5)";
  const away_fill = away_color ?? match.away_kit_color ?? "rgba(255,255,255,.5)";
  const selected_color = team_select === "home" ? home_fill : away_fill;

  const home_team = teams_api.get(match.home_team_id);
  const away_team = teams_api.get(match.away_team_id);

  return (
    <div style={{ width: "100%" }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <TeamChip
          name={home_team?.name ?? match.home_team_id}
          flag={home_team?.flag}
          flag_url={home_team?.flag_url}
          color={home_fill}
          active={team_select === "home"}
          onClick={() => select("home")}
        />
        <TeamChip
          name={away_team?.name ?? match.away_team_id}
          flag={away_team?.flag}
          flag_url={away_team?.flag_url}
          color={away_fill}
          active={team_select === "away"}
          onClick={() => select("away")}
        />
      </div>
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: `${SVG_W} / ${SVG_H}`,
          background: "rgba(255,255,255,.012)",
          border: "1px solid rgba(255,255,255,.05)",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        <PitchSurface />
        {positions.map(pos => (
          <PlayerToken
            key={pos.player.id}
            pos={pos}
            color={selected_color}
            events={event_counts.get(pos.player.id)}
            sub={effective_subs.get(pos.player.id)}
            on_open={on_open_player}
          />
        ))}
        {selected_formation ? (
          <span
            style={{
              position: "absolute",
              top: 10,
              left: "50%",
              transform: "translateX(-50%)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.5,
              color: "rgba(255,255,255,.7)",
              background: "rgba(0,0,0,.5)",
              padding: "4px 10px",
              borderRadius: 4,
              fontFamily: "monospace",
              zIndex: 2,
            }}
          >
            {selected_formation}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function TeamChip({
  name,
  flag,
  flag_url,
  color,
  active,
  onClick,
}: {
  name: string;
  flag?: string;
  flag_url?: string;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        background: active ? "rgba(255,255,255,.05)" : "transparent",
        border: `1px solid ${active ? color : "rgba(255,255,255,.08)"}`,
        borderRadius: 10,
        color: active ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.55)",
        fontSize: 14,
        fontWeight: active ? 700 : 500,
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "all .15s ease",
      }}
    >
      {flag_url ? (
        <img
          src={flag_url}
          alt=""
          style={{ width: 24, height: 16, objectFit: "cover", borderRadius: 2 }}
        />
      ) : flag ? (
        <span style={{ fontSize: 18 }}>{flag}</span>
      ) : null}
      <span style={{ flex: 1, textAlign: "left" }}>{name}</span>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: active ? color : "transparent",
          border: `1px solid ${active ? color : "rgba(255,255,255,.2)"}`,
        }}
      />
    </button>
  );
}

function PitchSurface() {
  // Helper: project an axis-aligned rectangle in pitch space (u1,v1)-(u2,v2)
  // into the quadrilateral on screen (its corners get projected one by one).
  function quad_pts(u1: number, v1: number, u2: number, v2: number): string {
    const points: [number, number][] = [
      [p_x(u1, v1), p_y(v1)],
      [p_x(u2, v1), p_y(v1)],
      [p_x(u2, v2), p_y(v2)],
      [p_x(u1, v2), p_y(v2)],
    ];
    return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  }

  // Center circle becomes an ellipse on screen (the trapezoid squishes it
  // vertically and stretches it horizontally based on local pitch width).
  const cx_c = p_x(0.5, 0.5);
  const cy_c = p_y(0.5);
  const rx_c = p_x(0.5 + CIRCLE_U, 0.5) - cx_c;
  const ry_c = (p_y(0.5 + CIRCLE_V) - p_y(0.5 - CIRCLE_V)) / 2;

  // Pen-spot positions
  const ps_far = { x: p_x(0.5, PEN_SPOT_V), y: p_y(PEN_SPOT_V) };
  const ps_near = { x: p_x(0.5, 1 - PEN_SPOT_V), y: p_y(1 - PEN_SPOT_V) };

  // Horizontal stripes — alternating slightly lighter / slightly darker bands
  // running across the pitch length, just like a real cut field. Subtle so it
  // reads as texture, not graphic design.
  const stripes: string[] = [];
  for (let i = 0; i < STRIPE_COUNT; i++) {
    const v1 = i / STRIPE_COUNT;
    const v2 = (i + 1) / STRIPE_COUNT;
    stripes.push(quad_pts(0, v1, 1, v2));
  }

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      preserveAspectRatio="none"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
    >
      <defs>
        {/* Depth shading — slightly darker at the far end, brighter near */}
        <linearGradient id="pitch_depth" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#0d1419" stopOpacity="0.45" />
          <stop offset="55%" stopColor="#0d1419" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#0d1419" stopOpacity="0" />
        </linearGradient>
        {/* Near-side spotlight — keeps the foreground readable */}
        <radialGradient id="pitch_spot" cx="50%" cy="100%" r="85%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.06" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0.02" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Pitch surface base — slightly warmer than the page background */}
      <polygon points={quad_pts(0, 0, 1, 1)} fill="#10171c" />
      {/* Mowing stripes — every other band a hair lighter */}
      {stripes.map((pts, i) => (
        <polygon
          key={i}
          points={pts}
          fill="#ffffff"
          fillOpacity={i % 2 === 0 ? 0.015 : 0.005}
        />
      ))}
      {/* Depth + spotlight on top of the surface */}
      <polygon points={quad_pts(0, 0, 1, 1)} fill="url(#pitch_depth)" />
      <polygon points={quad_pts(0, 0, 1, 1)} fill="url(#pitch_spot)" />
      {/* Touchlines + goal lines = the trapezoid outline */}
      <polygon
        points={quad_pts(0, 0, 1, 1)}
        fill="none"
        stroke={LINE}
        strokeWidth={TOUCHLINE_STROKE}
      />
      {/* Halfway line */}
      <line
        x1={p_x(0, 0.5)}
        y1={p_y(0.5)}
        x2={p_x(1, 0.5)}
        y2={p_y(0.5)}
        stroke={LINE}
        strokeWidth={STROKE}
      />
      {/* Center circle (drawn as an ellipse — flat perspective approx) */}
      <ellipse cx={cx_c} cy={cy_c} rx={rx_c} ry={ry_c} fill="none" stroke={LINE} strokeWidth={STROKE} />
      <circle cx={cx_c} cy={cy_c} r={0.55} fill={LINE} />
      {/* Far (away) penalty box + goal box */}
      <polygon
        points={quad_pts(0.5 - PEN_BOX_U / 2, 0, 0.5 + PEN_BOX_U / 2, PEN_BOX_V)}
        fill="none"
        stroke={LINE}
        strokeWidth={STROKE}
      />
      <polygon
        points={quad_pts(0.5 - GOAL_BOX_U / 2, 0, 0.5 + GOAL_BOX_U / 2, GOAL_BOX_V)}
        fill="none"
        stroke={LINE}
        strokeWidth={STROKE}
      />
      <circle cx={ps_far.x} cy={ps_far.y} r={0.55} fill={LINE} />
      {/* Near (home) penalty box + goal box */}
      <polygon
        points={quad_pts(0.5 - PEN_BOX_U / 2, 1 - PEN_BOX_V, 0.5 + PEN_BOX_U / 2, 1)}
        fill="none"
        stroke={LINE}
        strokeWidth={STROKE}
      />
      <polygon
        points={quad_pts(0.5 - GOAL_BOX_U / 2, 1 - GOAL_BOX_V, 0.5 + GOAL_BOX_U / 2, 1)}
        fill="none"
        stroke={LINE}
        strokeWidth={STROKE}
      />
      <circle cx={ps_near.x} cy={ps_near.y} r={0.55} fill={LINE} />
      {/* Goal nets — tiny rectangles outside the goal lines, hint at the
          goals themselves. Far is narrower (perspective). */}
      <line
        x1={p_x(0.5 - GOAL_BOX_U / 2 + 0.05, 0)}
        y1={p_y(0)}
        x2={p_x(0.5 + GOAL_BOX_U / 2 - 0.05, 0)}
        y2={p_y(0)}
        stroke={LINE_FAINT}
        strokeWidth={STROKE * 1.8}
      />
      <line
        x1={p_x(0.5 - GOAL_BOX_U / 2 + 0.05, 1)}
        y1={p_y(1)}
        x2={p_x(0.5 + GOAL_BOX_U / 2 - 0.05, 1)}
        y2={p_y(1)}
        stroke={LINE_FAINT}
        strokeWidth={STROKE * 1.8}
      />
    </svg>
  );
}

function PlayerToken({
  pos,
  color,
  events,
  sub,
  on_open,
}: {
  pos: PitchPosition;
  color: string;
  events?: MatchEventCounts;
  sub?: SubInfo;
  on_open: (player_id: number) => void;
}) {
  const p = pos.player;
  const ref = players_api.get(p.id);
  const photo = ref?.image_path;
  const change = p.change_last_match ?? 0;
  const value = p.value;

  // Project pitch (x, y) ∈ [0, 100] to screen via the trapezoid.
  const u = pos.x / 100;
  const v = pos.y / 100;
  const screen_x = p_x(u, v);
  const screen_y = p_y(v);
  const scale = token_scale(v);

  return (
    <button
      type="button"
      onClick={() => on_open(p.id)}
      title={`${p.name} · #${p.jersey_number}`}
      style={{
        position: "absolute",
        left: `${(screen_x / SVG_W) * 100}%`,
        top: `${(screen_y / SVG_H) * 100}%`,
        transform: `translate(-50%, -50%) scale(${scale})`,
        transformOrigin: "50% 50%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        background: "transparent",
        border: "none",
        padding: 0,
        cursor: "pointer",
        fontFamily: "inherit",
        // Higher z-index for near players so they overlap the far ones cleanly.
        zIndex: Math.round(v * 100),
      }}
    >
      <span
        style={{
          position: "relative",
          width: 54,
          height: 54,
          display: "block",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: 54,
            height: 54,
            borderRadius: "50%",
            overflow: "hidden",
            background: photo ? "transparent" : color,
            border: `2px solid ${color}`,
            boxShadow: "0 4px 10px rgba(0,0,0,.75), 0 0 0 1px rgba(0,0,0,.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {photo ? (
            <img
              src={photo}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : (
            <span className="mono" style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>
              {p.jersey_number}
            </span>
          )}
        </span>
        {/* Jersey corner badge — only when we have a photo, otherwise it
            duplicates the number already shown in the avatar center. */}
        {photo ? (
          <span
            className="mono"
            style={{
              position: "absolute",
              bottom: -4,
              right: -6,
              fontSize: 11,
              fontWeight: 800,
              background: "#0b0f14",
              color: "rgba(255,255,255,.95)",
              borderRadius: 8,
              padding: "2px 6px",
              border: "1px solid rgba(255,255,255,.25)",
              lineHeight: 1.2,
            }}
          >
            {p.jersey_number}
          </span>
        ) : null}
        {/* Match-event badge — same component as the list view so the
            two surfaces cannot drift. Top-left corner, off the jersey
            badge (bottom-right). */}
        <MatchEventBadge events={events} variant="corner" />
        {/* Substitution badge — bottom-left corner, opposite the
            jersey number. Only the entering player ends up shown on
            the pitch (apply_subs has swapped him in), so this badge
            is effectively "↘ minute" with the partner in the title. */}
        <SubBadge sub={sub} variant="corner" />
      </span>
      <span
        style={{
          marginTop: 6,
          fontSize: 13,
          fontWeight: 700,
          color: "rgba(255,255,255,.95)",
          maxWidth: 120,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          textShadow: "0 1px 3px rgba(0,0,0,.95)",
        }}
      >
        {short_name(p.name)}
      </span>
      {/* Live valo + per-match % on the same row, mono, dense. The value
          always shows; the % only when there's been a move (zero is
          visually noise). */}
      <span
        className="mono"
        style={{
          display: "flex",
          gap: 6,
          alignItems: "baseline",
          fontSize: 12,
          fontWeight: 700,
          textShadow: "0 1px 2px rgba(0,0,0,.9)",
          lineHeight: 1.1,
        }}
      >
        <span style={{ color: "rgba(255,255,255,.95)" }}>{fmt_eur_m(value)}</span>
        {change !== 0 ? (
          <span style={{ color: change >= 0 ? POS : NEG }}>{fmt_pct_token(change)}</span>
        ) : null}
      </span>
    </button>
  );
}

function short_name(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
}
