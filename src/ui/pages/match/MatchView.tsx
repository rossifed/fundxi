import { useEffect, useMemo, useState } from "react";
import type { Match, MatchPlayer } from "@/domain/match/match";
import type { MatchComment } from "@/domain/match/match_comment";
import type { Player } from "@/domain/player/player";
import { get_match_positions, type Formation, type PositionedPlayer } from "@/domain/match/pitch_layout";
import { comments_api } from "@/api/comments_api";
import { players_api } from "@/api/players_api";
import { teams_api } from "@/api/teams_api";
import { lerp } from "@/ui/helpers/chart_utils";
import { PlayerChip } from "@/ui/components/PlayerChip";
import { PositionBadge } from "@/ui/components/PositionBadge";
import { TradeDialog } from "@/ui/components/TradeDialog";

type RightTab = "home_lineup" | "away_lineup" | "commentary";

interface MatchViewProps {
  match: Match;
  on_back: () => void;
  on_open_player_profile: (player_id: number) => void;
  go_portfolio?: () => void;
}

// Derive a tactical formation string from the count of starting outfield
// players per position. Falls back to 4-3-3 when nothing fits.
function infer_formation(xi: MatchPlayer[]): Formation {
  const df = xi.filter(p => p.position === "DF").length;
  const mf = xi.filter(p => p.position === "MF").length;
  const fw = xi.filter(p => p.position === "FW").length;
  const key = `${df}-${mf}-${fw}`;
  const known: Record<string, Formation> = {
    "4-4-2": "4-4-2",
    "4-3-3": "4-3-3",
    "3-5-2": "3-5-2",
  };
  return known[key] ?? "4-3-3";
}

export function MatchView({ match, on_back, on_open_player_profile, go_portfolio }: MatchViewProps) {
  const [picked, set_picked] = useState<PositionedPlayer | null>(null);
  const [right_tab, set_right_tab] = useState<RightTab>("commentary");
  const [team_tab, set_team_tab] = useState<"home" | "away">("home");

  const home_team = teams_api.get(match.home_team_id);
  const away_team = teams_api.get(match.away_team_id);

  // Lineups now come from the BFF as full MatchPlayer[]; we resolve any stray
  // raw IDs (legacy contract) defensively.
  const home_xi: MatchPlayer[] = useMemo(
    () => match.home_xi.filter((x): x is MatchPlayer => typeof x !== "number"),
    [match.home_xi],
  );
  const away_xi: MatchPlayer[] = match.away_xi;

  const home_formation = useMemo(() => infer_formation(home_xi), [home_xi]);
  const away_formation = useMemo(() => infer_formation(away_xi), [away_xi]);

  const home_color = home_team?.color ?? "#888";
  const away_color = away_team?.color ?? "#888";

  const home_positions = useMemo(
    () => get_match_positions(home_xi.map(p => ({ ...p, team_color: home_color })), home_formation),
    [home_xi, home_color, home_formation],
  );
  const away_positions = useMemo(
    () => get_match_positions(away_xi.map(p => ({ ...p, team_color: away_color })), away_formation),
    [away_xi, away_color, away_formation],
  );

  const players = team_tab === "home" ? home_positions : away_positions;
  const subs: MatchPlayer[] = [];  // bench not yet plumbed into the front-end Match type
  const formation: Formation = team_tab === "home" ? home_formation : away_formation;
  const team_color =
    (team_tab === "home" ? home_team?.color : away_team?.color) ?? "#888";

  // Events feed (minute markers on the pitch) comes embedded with the Match
  // payload. The richer Sportmonks per-minute commentary feed is fetched
  // lazily on open from /api/fixtures/{id}/comments.
  const feed = match.events;
  const feed_chronological = [...feed].reverse();

  const [commentaries, set_commentaries] = useState<MatchComment[] | null>(null);
  useEffect(() => {
    if (!match.fixture_id) {
      set_commentaries([]);
      return;
    }
    let cancelled = false;
    set_commentaries(null);
    comments_api
      .for_fixture(match.fixture_id)
      .then(items => {
        if (!cancelled) set_commentaries(items);
      })
      .catch(() => {
        if (!cancelled) set_commentaries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [match.fixture_id]);
  const commentaries_chrono = useMemo(
    () => (commentaries ? [...commentaries].reverse() : []),
    [commentaries],
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", animation: "fu .25s ease" }}>
      {/* Score header */}
      <div
        style={{
          flexShrink: 0,
          padding: "12px 24px",
          borderBottom: "1px solid rgba(255,255,255,.05)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <button
          onClick={on_back}
          style={{
            background: "rgba(255,255,255,.04)",
            border: "1px solid rgba(255,255,255,.06)",
            borderRadius: 8,
            padding: "8px 14px",
            color: "rgba(255,255,255,.55)",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          ← Back
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 24, flex: 1, justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>{home_team?.flag}</span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{home_team?.name}</span>
          </div>
          <span className="mono" style={{ fontSize: 24, fontWeight: 900, letterSpacing: -1 }}>
            {match.home_score} : {match.away_score}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{away_team?.name}</span>
            <span style={{ fontSize: 22 }}>{away_team?.flag}</span>
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "rgba(255,255,255,.5)",
              background: "rgba(255,255,255,.08)",
              padding: "5px 10px",
              borderRadius: 6,
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "rgba(255,255,255,.5)",
                display: "inline-block",
                marginRight: 5,
                animation: "pulse 1.5s infinite",
              }}
            />
            {match.minute}'
          </span>
        </div>

        <span style={{ fontSize: 11, color: "rgba(255,255,255,.35)" }}>Group {match.group}</span>
      </div>

      {/* Pitch + Right panel */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* PITCH */}
        <div style={{ flex: 1, position: "relative", minHeight: 0, padding: 12 }} onClick={() => set_picked(null)}>
          {/* Team selector for pitch view */}
          <div style={{ position: "absolute", top: 24, left: 24, zIndex: 5, display: "flex", background: "rgba(2,4,6,.7)", backdropFilter: "blur(10px)", borderRadius: 8, padding: 3, border: "1px solid rgba(255,255,255,.06)" }}>
            {(
              [
                { k: "home" as const, label: home_team?.flag + " " + match.home_team_id },
                { k: "away" as const, label: away_team?.flag + " " + match.away_team_id },
              ]
            ).map(t => (
              <button
                key={t.k}
                onClick={() => set_team_tab(t.k)}
                style={{
                  padding: "5px 12px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  background: team_tab === t.k ? "rgba(255,255,255,.08)" : "transparent",
                  color: team_tab === t.k ? "#fff" : "rgba(255,255,255,.4)",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span
            style={{
              position: "absolute",
              top: 24,
              right: 24,
              zIndex: 5,
              fontSize: 11,
              color: "rgba(255,255,255,.35)",
              fontWeight: 600,
              background: "rgba(2,4,6,.7)",
              backdropFilter: "blur(10px)",
              padding: "5px 10px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,.06)",
            }}
          >
            {formation}
          </span>

          <PitchSvg
            players={players}
            picked={picked}
            on_pick={p => {
              set_picked(p);
              set_right_tab(team_tab === "home" ? "home_lineup" : "away_lineup");
            }}
            team_color={team_color}
            player_changes={match.player_changes}
          />
        </div>

        {/* RIGHT PANEL */}
        <aside
          style={{
            width: 380,
            flexShrink: 0,
            borderLeft: "1px solid rgba(255,255,255,.06)",
            display: "flex",
            flexDirection: "column",
            background: "rgba(2,4,6,.4)",
          }}
        >
          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
            {(
              [
                { k: "home_lineup" as RightTab, label: home_team?.flag + " XI" },
                { k: "away_lineup" as RightTab, label: away_team?.flag + " XI" },
                { k: "commentary" as RightTab, label: "Commentary" },
              ]
            ).map(t => (
              <button
                key={t.k}
                onClick={() => set_right_tab(t.k)}
                style={{
                  flex: 1,
                  padding: "12px 0",
                  fontSize: 12,
                  fontWeight: right_tab === t.k ? 700 : 500,
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  background: "transparent",
                  color: right_tab === t.k ? "#fff" : "rgba(255,255,255,.35)",
                  borderBottom: right_tab === t.k ? "2px solid #fff" : "2px solid transparent",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {picked ? (
              <PickedPlayerPanel
                pitch_player={picked}
                in_match_change={match.player_changes[picked.id] ?? 0}
                on_back={() => set_picked(null)}
                on_open_profile={() => on_open_player_profile(picked.id)}
                go_portfolio={go_portfolio}
              />
            ) : right_tab === "home_lineup" ? (
              <LineupList
                xi={home_positions}
                subs={[]}
                player_changes={match.player_changes}
                on_pick={p => {
                  set_team_tab("home");
                  set_picked(p);
                }}
              />
            ) : right_tab === "away_lineup" ? (
              <LineupList
                xi={away_positions}
                subs={[]}
                player_changes={match.player_changes}
                on_pick={p => {
                  set_team_tab("away");
                  set_picked(p);
                }}
              />
            ) : (
              <SportmonksCommentary
                comments={commentaries_chrono}
                loading={commentaries === null}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ───── Pitch SVG ─────

function PitchSvg({
  players,
  picked,
  on_pick,
  team_color,
  player_changes,
}: {
  players: PositionedPlayer[];
  picked: PositionedPlayer | null;
  on_pick: (p: PositionedPlayer) => void;
  team_color: string;
  player_changes: Record<number, number>;
}) {
  return (
    <svg
      viewBox="0 0 400 280"
      style={{ width: "100%", height: "100%", display: "block" }}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="pitchSurf" x1=".1" y1="0" x2=".5" y2="1">
          <stop offset="0%" stopColor="#060d18" />
          <stop offset="40%" stopColor="#081220" />
          <stop offset="70%" stopColor="#0a1525" />
          <stop offset="100%" stopColor="#040810" />
        </linearGradient>
        <linearGradient id="pitchLines" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,.06)" />
          <stop offset="100%" stopColor="rgba(255,255,255,.12)" />
        </linearGradient>
        <radialGradient id="pitchCenter" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255,255,255,.03)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient id="pitchSpot" cx="50%" cy="35%" r="55%">
          <stop offset="0%" stopColor={`${team_color}10`} />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <filter id="pitchGlow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <ellipse cx="200" cy="275" rx="180" ry="10" fill="rgba(0,0,0,.3)" />
      {(() => {
        const TL = { x: 80, y: 8 };
        const TR = { x: 320, y: 8 };
        const BL = { x: 0, y: 272 };
        const BR = { x: 400, y: 272 };
        const point_at = (xP: number, yP: number) => {
          const lx = lerp(TL.x, BL.x, yP);
          const rx = lerp(TR.x, BR.x, yP);
          return { x: lerp(lx, rx, xP), y: lerp(TL.y, BL.y, yP) };
        };
        const fTL = point_at(0.04, 0.03);
        const fTR = point_at(0.96, 0.03);
        const fBL = point_at(0.04, 0.97);
        const fBR = point_at(0.96, 0.97);
        const ctr = point_at(0.5, 0.5);
        return (
          <>
            <polygon points={`${TL.x},${TL.y} ${TR.x},${TR.y} ${BR.x},${BR.y} ${BL.x},${BL.y}`} fill="url(#pitchSurf)" />
            <polygon points={`${TL.x},${TL.y} ${TR.x},${TR.y} ${BR.x},${BR.y} ${BL.x},${BL.y}`} fill="url(#pitchSpot)" />
            <polygon points={`${fTL.x},${fTL.y} ${fTR.x},${fTR.y} ${fBR.x},${fBR.y} ${fBL.x},${fBL.y}`} fill="none" stroke="url(#pitchLines)" strokeWidth=".8" />
            <line x1={point_at(0.04, 0.5).x} y1={point_at(0.04, 0.5).y} x2={point_at(0.96, 0.5).x} y2={point_at(0.96, 0.5).y} stroke="rgba(255,255,255,.1)" strokeWidth=".6" />
            <ellipse cx={ctr.x} cy={ctr.y} rx="38" ry="22" fill="url(#pitchCenter)" stroke="rgba(255,255,255,.07)" strokeWidth=".5" />
            <circle cx={ctr.x} cy={ctr.y} r="2" fill="rgba(255,255,255,.1)" />
            {/* Boxes */}
            {(() => {
              const a = point_at(0.22, 0.03);
              const b = point_at(0.78, 0.03);
              const c = point_at(0.78, 0.18);
              const d = point_at(0.22, 0.18);
              return (
                <polygon
                  points={`${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y}`}
                  fill="none"
                  stroke="rgba(255,255,255,.05)"
                  strokeWidth=".5"
                />
              );
            })()}
            {(() => {
              const a = point_at(0.22, 0.82);
              const b = point_at(0.78, 0.82);
              const c = point_at(0.78, 0.97);
              const d = point_at(0.22, 0.97);
              return (
                <polygon
                  points={`${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y}`}
                  fill="none"
                  stroke="rgba(255,255,255,.05)"
                  strokeWidth=".5"
                />
              );
            })()}
            {/* Players */}
            {players.map(p => {
              const change = player_changes[p.id] ?? 0;
              const sel = picked?.id === p.id;
              const change_color = change > 0 ? "#216c6e" : change < 0 ? "#E41541" : "rgba(255,255,255,.3)";
              const yT = p.y / 100;
              const lx = lerp(fTL.x, fBL.x, yT);
              const rx = lerp(fTR.x, fBR.x, yT);
              const px = lerp(lx, rx, p.x / 100);
              const py = lerp(fTL.y, fBL.y, yT);
              const r = sel ? 18 : 14;
              const bdr = sel
                ? "#fff"
                : change > 0
                  ? "rgba(55,255,99,.55)"
                  : change < 0
                    ? "rgba(255,40,93,.45)"
                    : "rgba(255,255,255,.12)";
              const pillW = Math.max(40, p.name.length * 5.5 + 14);
              const pillH = 13;
              const pillY = py + r + 4;
              return (
                <g
                  key={p.id}
                  onClick={e => {
                    e.stopPropagation();
                    on_pick(p);
                  }}
                  style={{ cursor: "pointer", opacity: picked && !sel ? 0.4 : 1, transition: "opacity .2s" }}
                >
                  {sel && <circle cx={px} cy={py} r={r + 6} fill="none" stroke={`${p.team_color}55`} strokeWidth="2.5" filter="url(#pitchGlow)" />}
                  <circle cx={px} cy={py} r={r} fill={`${p.team_color}cc`} stroke={bdr} strokeWidth={sel ? "2.5" : "1.5"} />
                  <circle cx={px - r * 0.15} cy={py - r * 0.15} r={r * 0.35} fill={`${p.team_color}30`} />
                  <text x={px} y={py + r * 0.34} textAnchor="middle" fill="#fff" fontSize={sel ? 14 : 12} fontWeight="800" fontFamily="'JetBrains Mono',monospace">
                    {p.jersey_number}
                  </text>
                  <rect x={px - pillW / 2} y={pillY} width={pillW} height={pillH} rx={pillH / 2} fill="rgba(6,7,11,.85)" stroke="rgba(255,255,255,.08)" strokeWidth=".5" />
                  <text x={px} y={pillY + pillH * 0.72} textAnchor="middle" fill="rgba(255,255,255,.95)" fontSize="9" fontWeight="700" fontFamily="'Inter',sans-serif">
                    {p.name}
                  </text>
                  {change !== 0 && (
                    <>
                      <rect x={px - 14} y={pillY + pillH + 2} width={28} height={10} rx={3} fill={change > 0 ? "rgba(55,255,99,.18)" : "rgba(255,40,93,.18)"} />
                      <text x={px} y={pillY + pillH + 9.5} textAnchor="middle" fill={change_color} fontSize="7" fontWeight="700" fontFamily="'JetBrains Mono',monospace">
                        {change > 0 ? "+" : ""}{change}%
                      </text>
                    </>
                  )}
                </g>
              );
            })}
          </>
        );
      })()}
    </svg>
  );
}

// ───── Right panel views ─────

function LineupList({
  xi,
  subs,
  player_changes,
  on_pick,
}: {
  xi: PositionedPlayer[];
  subs: (MatchPlayer & { team_color: string })[];
  player_changes: Record<number, number>;
  on_pick: (p: PositionedPlayer) => void;
}) {
  return (
    <div>
      <SectionLabel>Starting XI</SectionLabel>
      {xi.map(p => (
        <PlayerRow
          key={p.id}
          name={p.name}
          jersey_number={p.jersey_number}
          team_color={p.team_color}
          subtitle={p.role}
          value={p.value}
          rating={p.rating}
          change={player_changes[p.id] ?? 0}
          on_click={() => on_pick(p)}
        />
      ))}
      <SectionLabel>Substitutes</SectionLabel>
      {subs.map(p => (
        <PlayerRow
          key={p.id}
          name={p.name}
          jersey_number={p.jersey_number}
          team_color={p.team_color}
          subtitle={p.position}
          value={p.value}
          rating={p.rating}
          change={player_changes[p.id] ?? 0}
          dim
          on_click={() =>
            on_pick({ ...p, x: 0, y: 0, role: p.position })
          }
        />
      ))}
    </div>
  );
}

function SportmonksCommentary({
  comments,
  loading,
}: {
  comments: MatchComment[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: "rgba(255,255,255,.4)" }}>
        loading commentary…
      </div>
    );
  }
  if (comments.length === 0) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: "rgba(255,255,255,.4)" }}>
        No commentary for this match.
      </div>
    );
  }
  return (
    <div style={{ padding: "8px" }}>
      {comments.map(c => {
        const minute_label = c.extra_minute ? `${c.minute}+${c.extra_minute}'` : `${c.minute}'`;
        const accent = c.is_goal ? "#216c6e" : c.is_important ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.25)";
        return (
          <div
            key={c.id}
            style={{
              display: "flex",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 8,
              background: c.is_goal ? "rgba(55,255,99,.05)" : "transparent",
              border: `1px solid ${c.is_goal ? "rgba(55,255,99,.1)" : "rgba(255,255,255,.03)"}`,
              borderLeft: `3px solid ${accent}`,
              marginBottom: 4,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 36, gap: 1 }}>
              <span className="mono" style={{ fontSize: 11, color: accent, fontWeight: 800 }}>{minute_label}</span>
              {c.is_goal && <span style={{ fontSize: 14 }}>⚽</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: c.is_goal ? 700 : 500,
                  color: c.is_goal ? "#fff" : "rgba(255,255,255,.85)",
                  lineHeight: 1.45,
                }}
              >
                {c.comment}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function _UnusedCommentaryFeed({
  events,
  on_pick,
}: {
  events: { minute: number; type: string; player_id: number; headline?: string; comment?: string }[];
  on_pick: (player_id: number) => void;
}) {
  return (
    <div style={{ padding: "8px" }}>
      {events.map((ev, i) => {
        const importance =
          ev.type === "⚽"
            ? "#216c6e"
            : ev.type === "🟨"
              ? "rgba(255,255,255,.5)"
              : "rgba(255,255,255,.35)";
        const is_goal = ev.type === "⚽";
        return (
          <div
            key={i}
            onClick={() => on_pick(ev.player_id)}
            style={{
              display: "flex",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 8,
              background: is_goal ? "rgba(55,255,99,.05)" : "transparent",
              border: `1px solid ${is_goal ? "rgba(55,255,99,.1)" : "rgba(255,255,255,.03)"}`,
              borderLeft: `3px solid ${importance}`,
              cursor: "pointer",
              marginBottom: 4,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 28, gap: 1 }}>
              <span className="mono" style={{ fontSize: 12, color: importance, fontWeight: 800 }}>{ev.minute}'</span>
              <span style={{ fontSize: 14 }}>{ev.type}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: is_goal ? 800 : 600, color: is_goal ? "#fff" : "rgba(255,255,255,.7)", marginBottom: 1 }}>
                {ev.headline}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", lineHeight: 1.4 }}>{ev.comment}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PickedPlayerPanel({
  pitch_player,
  in_match_change,
  on_back,
  on_open_profile,
  go_portfolio,
}: {
  pitch_player: PositionedPlayer;
  in_match_change: number;
  on_back: () => void;
  on_open_profile: () => void;
  go_portfolio?: () => void;
}) {
  const player = as_player(pitch_player);
  const [trade_dialog_kind, set_trade_dialog_kind] = useState<"buy" | "sell" | null>(null);

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <button
        onClick={on_back}
        style={{
          alignSelf: "flex-start",
          background: "transparent",
          border: "none",
          color: "rgba(255,255,255,.45)",
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
          padding: 0,
        }}
      >
        ← Back to lineup
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <PlayerChip jersey_number={pitch_player.jersey_number} team_color={pitch_player.team_color} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {pitch_player.full_name ?? pitch_player.name}
          </div>
          <div style={{ marginTop: 2 }}>
            <PositionBadge position={pitch_player.position} />
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
        <Stat label="Value" value={`€${pitch_player.value}M`} />
        <Stat label="In-game" value={`${in_match_change >= 0 ? "+" : ""}${in_match_change}%`} color={in_match_change >= 0 ? "#216c6e" : "#E41541"} />
        <Stat label="Rating" value={String(pitch_player.rating)} color="rgba(255,255,255,.7)" />
      </div>

      <button
        onClick={on_open_profile}
        style={{
          width: "100%",
          padding: "8px 0",
          fontSize: 11,
          fontWeight: 700,
          borderRadius: 8,
          background: "rgba(255,255,255,.06)",
          color: "#fff",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Open full profile →
      </button>

      <div style={{ display: "flex", gap: 6, borderTop: "1px solid rgba(255,255,255,.05)", paddingTop: 10 }}>
        <button
          onClick={() => set_trade_dialog_kind("buy")}
          style={{
            flex: 1,
            padding: "11px 0",
            fontSize: 13,
            fontWeight: 800,
            borderRadius: 9,
            background: "linear-gradient(135deg,#216c6e,#16a34a)",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            boxShadow: "0 4px 16px rgba(34,197,94,.2)",
          }}
        >
          Buy
        </button>
        <button
          onClick={() => set_trade_dialog_kind("sell")}
          style={{
            flex: 1,
            padding: "11px 0",
            fontSize: 13,
            fontWeight: 800,
            borderRadius: 9,
            background: "rgba(255,40,93,.1)",
            color: "#E41541",
            border: "1px solid rgba(255,40,93,.25)",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Sell
        </button>
      </div>

      <TradeDialog
        open={trade_dialog_kind !== null}
        player={player}
        initial_kind={trade_dialog_kind ?? "buy"}
        on_close={() => set_trade_dialog_kind(null)}
        go_portfolio={go_portfolio}
        current_price={pitch_player.value}
        change_24h={pitch_player.change_24h}
      />
    </div>
  );
}

// ───── Helpers ─────

function as_player(mp: MatchPlayer): Player {
  return (
    players_api.get(mp.id) ?? {
      id: mp.id,
      name: mp.name,
      full_name: mp.full_name,
      jersey_number: mp.jersey_number,
      team_id: mp.team_id ?? "",
      position: mp.position,
      tags: mp.tags,
    }
  );
}

function PlayerRow({
  name,
  jersey_number,
  team_color,
  subtitle,
  value,
  rating,
  change,
  dim,
  on_click,
}: {
  name: string;
  jersey_number: number;
  team_color: string;
  subtitle: string;
  value: number;
  rating: number;
  change: number;
  dim?: boolean;
  on_click: () => void;
}) {
  return (
    <div
      onClick={on_click}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        borderBottom: "1px solid rgba(255,255,255,.03)",
        cursor: "pointer",
        opacity: dim ? 0.65 : 1,
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,.025)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      <PlayerChip jersey_number={jersey_number} team_color={team_color} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,.3)" }}>{subtitle}</div>
      </div>
      <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.5)" }}>€{value}M</span>
      <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: change >= 0 ? "#216c6e" : "#E41541", minWidth: 36, textAlign: "right" }}>
        {change >= 0 ? "+" : ""}{change}%
      </span>
      <span
        className="mono"
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: "rgba(255,255,255,.55)",
          background: "rgba(255,255,255,.05)",
          padding: "2px 6px",
          borderRadius: 4,
        }}
      >
        {rating}
      </span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "10px 14px 6px",
        fontSize: 10,
        fontWeight: 700,
        color: "rgba(255,255,255,.35)",
        letterSpacing: 0.5,
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,.03)", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,.35)", letterSpacing: 0.4, fontWeight: 600 }}>{label}</div>
      <div className="mono" style={{ fontSize: 12, fontWeight: 800, color: color ?? "#fff", marginTop: 1 }}>
        {value}
      </div>
    </div>
  );
}
