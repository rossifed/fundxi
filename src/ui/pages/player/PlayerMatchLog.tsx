/* PlayerMatchLog — the player's per-match log and team news, tabbed.
 *
 * DDD role: presentational UI component. Owns its own data fetch
 * (matches + news) and tab state — a self-contained panel.
 */

import { useEffect, useState } from "react";
import { players_api } from "@/api/players_api";
import { teams_api } from "@/api/teams_api";
import type { PlayerMatchEntry } from "@/infrastructure/repositories/player_matches_repository";
import type { PlayerNewsEntry } from "@/infrastructure/repositories/player_news_repository";
import { fmt_signed_pct } from "@/ui/helpers/format";

interface PlayerMatchLogProps {
  player_id: number;
  on_open_match?: (fixture_id: number) => void;
}

export function PlayerMatchLog({ player_id, on_open_match }: PlayerMatchLogProps) {
  // Per-match summary list — each entry carries the fixture metadata + the
  // player's stat line; click-through reopens the dedicated MatchView.
  const [match_entries, set_match_entries] = useState<PlayerMatchEntry[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    set_match_entries(null);
    players_api
      .get_matches(player_id)
      .then(items => {
        if (!cancelled) set_match_entries(items);
      })
      .catch(() => {
        if (!cancelled) set_match_entries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [player_id]);

  // Team-level news (Sportmonks news are tied to fixtures, not players).
  const [news_entries, set_news_entries] = useState<PlayerNewsEntry[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    set_news_entries(null);
    players_api
      .get_news(player_id)
      .then(items => {
        if (!cancelled) set_news_entries(items);
      })
      .catch(() => {
        if (!cancelled) set_news_entries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [player_id]);

  const [active_tab, set_active_tab] = useState<"matches" | "news">("matches");

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "0 24px 20px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", gap: 4 }}>
          {(["matches", "news"] as const).map(tab => {
            const active = active_tab === tab;
            const label = tab === "matches" ? "Fixtures" : "News";
            return (
              <button
                key={tab}
                onClick={() => set_active_tab(tab)}
                style={{
                  background: active ? "rgba(255,255,255,.06)" : "transparent",
                  border: "1px solid rgba(255,255,255,.06)",
                  color: active ? "#fff" : "rgba(255,255,255,.45)",
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                  borderRadius: 5,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,.25)" }}>
          {active_tab === "matches"
            ? match_entries === null
              ? "loading…"
              : `${match_entries.length} appearances`
            : news_entries === null
              ? "loading…"
              : `${news_entries.length} articles`}
        </span>
      </div>
      <div
        className="scroll-visible"
        style={{ flex: 1, overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 6 }}
      >
        {active_tab === "matches" ? (
          <>
            {match_entries === null && (
              <div style={{ padding: "12px 8px", fontSize: 12, color: "rgba(255,255,255,.4)" }}>loading…</div>
            )}
            {match_entries !== null && match_entries.length === 0 && (
              <div style={{ padding: "12px 8px", fontSize: 12, color: "rgba(255,255,255,.4)" }}>
                No matches played yet for this player.
              </div>
            )}
            {match_entries?.map(m => {
              const is_home = m.player_team_id === m.home_team_id;
              const home = teams_api.get(m.home_team_id);
              const away = teams_api.get(m.away_team_id);
              const opp = is_home ? away : home;
              const my_score = is_home ? m.home_score : m.away_score;
              const opp_score = is_home ? m.away_score : m.home_score;
              const is_finished = m.status === "finished";
              const is_live = m.status === "live";
              const is_upcoming = m.status === "upcoming";
              const result =
                !is_finished || my_score == null || opp_score == null
                  ? null
                  : my_score > opp_score
                    ? "W"
                    : my_score < opp_score
                      ? "L"
                      : "D";
              const result_color =
                result === "W"
                  ? "var(--color-positive)"
                  : result === "L"
                    ? "var(--color-negative)"
                    : "rgba(255,255,255,.45)";
              const dt = m.kickoff_at ? new Date(m.kickoff_at) : null;
              const date_label = dt
                ? dt.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" })
                : "—";
              const time_label = dt ? dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";
              const score_label = my_score != null && opp_score != null ? `${my_score}-${opp_score}` : "—";
              const pct_label = m.in_match_pct != null ? fmt_signed_pct(m.in_match_pct, 2) : "—";
              const pct_color =
                m.in_match_pct == null
                  ? "rgba(255,255,255,.3)"
                  : m.in_match_pct >= 0
                    ? "var(--color-positive)"
                    : "var(--color-negative)";
              return (
                <div
                  key={m.fixture_id}
                  onClick={() => on_open_match?.(m.fixture_id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "32px 22px minmax(0, 1fr) auto auto",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    borderRadius: 6,
                    background: is_live
                      ? "rgba(244,18,88,.08)"
                      : is_upcoming
                        ? "rgba(255,255,255,.015)"
                        : "rgba(255,255,255,.025)",
                    border: `1px solid ${is_live ? "rgba(244,18,88,.25)" : "rgba(255,255,255,.05)"}`,
                    cursor: on_open_match ? "pointer" : "default",
                  }}
                >
                  {is_live ? (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 800,
                        color: "#fff",
                        background: "var(--color-action-sell)",
                        padding: "2px 5px",
                        borderRadius: 3,
                        letterSpacing: 0.6,
                      }}
                    >
                      LIVE
                    </span>
                  ) : is_upcoming ? (
                    <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.4)", letterSpacing: 0.5 }}>
                      SOON
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, fontWeight: 800, color: result_color, letterSpacing: 0.5 }}>
                      {result ?? "—"}
                    </span>
                  )}
                  {opp?.flag_url ? (
                    <img
                      src={opp.flag_url}
                      alt={opp.name}
                      style={{ width: 22, height: 22, objectFit: "contain", flexShrink: 0 }}
                    />
                  ) : (
                    <span style={{ fontSize: 16 }}>{opp?.flag ?? ""}</span>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#fff",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {opp?.name ?? (is_home ? m.away_team_id : m.home_team_id)}
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,.4)" }}>
                      {is_upcoming || is_live
                        ? `${date_label}${time_label ? ` · ${time_label}` : ""}`
                        : `${date_label}${m.role ? ` · ${m.role === "starter" ? "starter" : "bench"}` : ""}`}
                    </div>
                  </div>
                  <span className="mono" style={{ fontSize: 12, fontWeight: 800, color: "#fff" }}>
                    {is_finished || is_live ? score_label : "—"}
                  </span>
                  <span
                    className="mono"
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: is_finished ? pct_color : "rgba(255,255,255,.3)",
                      minWidth: 64,
                      textAlign: "right",
                    }}
                  >
                    {is_finished ? pct_label : "—"}
                  </span>
                </div>
              );
            })}
          </>
        ) : (
          <>
            {news_entries === null && (
              <div style={{ padding: "12px 8px", fontSize: 12, color: "rgba(255,255,255,.4)" }}>loading…</div>
            )}
            {news_entries !== null && news_entries.length === 0 && (
              <div style={{ padding: "12px 8px", fontSize: 12, color: "rgba(255,255,255,.4)" }}>
                No news yet for this player&apos;s team.
              </div>
            )}
            {news_entries?.map(n => {
              const dt = n.published_at ? new Date(n.published_at) : null;
              const date_label = dt
                ? dt.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" })
                : "—";
              const type_label = n.type === "prematch" ? "PRE" : n.type === "postmatch" ? "POST" : n.type.toUpperCase();
              return (
                <div
                  key={n.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "44px minmax(0, 1fr) auto",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    borderRadius: 6,
                    background: "rgba(255,255,255,.025)",
                    border: "1px solid rgba(255,255,255,.05)",
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      color: "rgba(255,255,255,.55)",
                      background: "rgba(255,255,255,.04)",
                      border: "1px solid rgba(255,255,255,.06)",
                      padding: "2px 5px",
                      borderRadius: 4,
                      textAlign: "center",
                      letterSpacing: 0.6,
                    }}
                  >
                    {type_label}
                  </span>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#fff", lineHeight: 1.35 }}>{n.title}</div>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,.35)", whiteSpace: "nowrap" }}>
                    {date_label}
                  </span>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
