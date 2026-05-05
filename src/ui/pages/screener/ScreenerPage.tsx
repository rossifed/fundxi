import { useMemo, useState } from "react";
import { players_api } from "@/api/players_api";
import { portfolio_api } from "@/api/portfolio_api";
import { teams_api } from "@/api/teams_api";
import type { Player, Position } from "@/domain/player/player";
import { POSITION_LABEL } from "@/domain/player/player";
import { type SortKey } from "@/application/screener_service";
import { PlayerChip } from "@/ui/components/PlayerChip";
import { PositionBadge } from "@/ui/components/PositionBadge";
import { Spark } from "@/ui/components/Spark";
import { gen_spark } from "@/ui/helpers/chart_utils";
import { price_label } from "@/ui/helpers/format";
import { toggle_set } from "@/ui/helpers/state";
import { position_color } from "@/ui/design/tokens";

const CONFEDERATIONS = [
  { code: "UEFA", label: "Europe" },
  { code: "CONMEBOL", label: "South America" },
  { code: "CONCACAF", label: "N/C America" },
  { code: "AFC", label: "Asia" },
  { code: "CAF", label: "Africa" },
  { code: "OFC", label: "Oceania" },
] as const;

interface ScreenerPageProps {
  on_open_player: (player: Player) => void;
  watchlist?: Set<number>;
  toggle_watch?: (id: number) => void;
}

export function ScreenerPage({ on_open_player, watchlist, toggle_watch }: ScreenerPageProps) {
  const [position_filters, set_position_filters] = useState<Set<Position>>(new Set());
  const [team_filters, set_team_filters] = useState<Set<string>>(new Set());
  const [price_range, set_price_range] = useState<[number, number]>([0, 999]);
  const [sort_key, set_sort_key] = useState<SortKey>("value");
  const [search, set_search] = useState("");
  const [show_filters, set_show_filters] = useState(true);

  const all_team_ids = useMemo(() => Array.from(new Set(players_api.list().map(p => p.team_id))), []);
  const my_holdings = useMemo(() => portfolio_api.get_holdings(), []);
  const held_ids = useMemo(() => new Set(my_holdings.map(h => h.player_id)), [my_holdings]);

  const filtered = useMemo(
    () =>
      players_api.search({
        positions: position_filters,
        team_ids: team_filters,
        min_value: price_range[0],
        max_value: price_range[1],
        search,
        sort: sort_key,
      }),
    [position_filters, team_filters, price_range, search, sort_key],
  );

  const has_filters =
    position_filters.size > 0 || team_filters.size > 0 || price_range[0] > 0 || price_range[1] < 999;
  const active_count =
    position_filters.size + team_filters.size + (price_range[0] > 0 || price_range[1] < 999 ? 1 : 0);

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start", animation: "fu .3s ease" }}>
      {/* Filter sidebar */}
      {show_filters && (
        <aside
          style={{
            width: 240,
            flexShrink: 0,
            background: "rgba(255,255,255,.02)",
            border: "1px solid rgba(255,255,255,.04)",
            borderRadius: 12,
            padding: "16px",
            position: "sticky",
            top: 108,
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", color: "rgba(255,255,255,.7)" }}>
              Filters
            </span>
            {has_filters && (
              <button
                onClick={() => {
                  set_position_filters(new Set());
                  set_team_filters(new Set());
                  set_price_range([0, 999]);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(255,255,255,.35)",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  padding: 0,
                }}
              >
                Reset
              </button>
            )}
          </div>

          {/* Position */}
          <div>
            <FilterLabel>Position</FilterLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {(["FW", "MF", "DF", "GK"] as Position[]).map(p => {
                const on = position_filters.has(p);
                return (
                  <button
                    key={p}
                    onClick={() => toggle_set(position_filters, set_position_filters, p)}
                    style={{
                      padding: "7px 10px",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: on ? 700 : 500,
                      border: on ? "1px solid rgba(255,255,255,.18)" : "1px solid rgba(255,255,255,.06)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      background: on ? position_color[p] + "18" : "rgba(255,255,255,.02)",
                      color: on ? "#fff" : "rgba(255,255,255,.4)",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      textAlign: "left",
                    }}
                  >
                    <div style={{ width: 6, height: 6, borderRadius: 2, background: position_color[p], opacity: on ? 1 : 0.4 }} />
                    {POSITION_LABEL[p]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Price range */}
          <div>
            <FilterLabel>Price range</FilterLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {([[0, 30], [30, 60], [60, 100], [100, 150], [150, 999]] as [number, number][]).map(([lo, hi]) => {
                const active = price_range[0] === lo && price_range[1] === hi;
                return (
                  <button
                    key={lo}
                    onClick={() => set_price_range(active ? [0, 999] : [lo, hi])}
                    style={{
                      padding: "7px 10px",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: active ? 700 : 500,
                      border: "none",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      background: active ? "rgba(255,255,255,.06)" : "transparent",
                      color: active ? "#fff" : "rgba(255,255,255,.4)",
                      textAlign: "left",
                    }}
                  >
                    {price_label(lo)} — {price_label(hi)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Teams */}
          <div>
            <FilterLabel>
              Team {team_filters.size > 0 ? `(${team_filters.size})` : ""}
            </FilterLabel>
            <div style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
              {CONFEDERATIONS.map(conf => {
                const teams_in_conf = all_team_ids.filter(id => teams_api.get(id)?.confederation === conf.code);
                if (teams_in_conf.length === 0) return null;
                return (
                  <div key={conf.code}>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,.25)", fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>
                      {conf.label}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      {teams_in_conf.map(id => {
                        const team = teams_api.get(id);
                        if (!team) return null;
                        const on = team_filters.has(id);
                        return (
                          <button
                            key={id}
                            onClick={() => toggle_set(team_filters, set_team_filters, id)}
                            style={{
                              padding: "5px 8px",
                              borderRadius: 5,
                              fontSize: 12,
                              fontWeight: on ? 700 : 500,
                              border: "none",
                              cursor: "pointer",
                              fontFamily: "inherit",
                              background: on ? "rgba(255,255,255,.06)" : "transparent",
                              color: on ? "#fff" : "rgba(255,255,255,.4)",
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              textAlign: "left",
                            }}
                          >
                            <span style={{ fontSize: 13 }}>{team.flag}</span>
                            <span style={{ flex: 1 }}>{team.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      )}

      {/* Results */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Search + filter toggle */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button
            onClick={() => set_show_filters(!show_filters)}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 700,
              border: "1px solid rgba(255,255,255,.06)",
              background: show_filters ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.02)",
              color: show_filters ? "#fff" : "rgba(255,255,255,.5)",
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexShrink: 0,
            }}
          >
            ⚙ Filters {active_count > 0 && `(${active_count})`}
          </button>
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "rgba(255,255,255,.04)",
              border: "1px solid rgba(255,255,255,.06)",
              borderRadius: 10,
              padding: "0 14px",
            }}
          >
            <span style={{ fontSize: 16, color: "rgba(255,255,255,.25)" }}>🔍</span>
            <input
              value={search}
              onChange={e => set_search(e.target.value)}
              placeholder="Search players, teams, clubs..."
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "#fff",
                fontSize: 13,
                fontFamily: "'Inter',sans-serif",
                padding: "10px 0",
                minWidth: 0,
              }}
            />
            {search && (
              <span
                onClick={() => set_search("")}
                style={{ fontSize: 13, color: "rgba(255,255,255,.25)", cursor: "pointer", padding: "4px 6px" }}
              >
                ✕
              </span>
            )}
          </div>
        </div>

        {/* Count + result table */}
        <div
          style={{
            background: "rgba(255,255,255,.02)",
            border: "1px solid rgba(255,255,255,.04)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "32px 1fr 80px 60px 70px 60px 50px 110px 70px",
              padding: "10px 16px",
              borderBottom: "1px solid rgba(255,255,255,.06)",
              fontSize: 10,
              fontWeight: 700,
              color: "rgba(255,255,255,.45)",
              letterSpacing: 0.5,
              textTransform: "uppercase",
              alignItems: "center",
              gap: 8,
              background: "rgba(255,255,255,.02)",
            }}
          >
            <span></span>
            <span>Player</span>
            <span>Team</span>
            <span>Pos</span>
            <ColumnHeader label="Value" sort_key="value" current={sort_key} on_select={set_sort_key} />
            <ColumnHeader label="24h" sort_key="change" current={sort_key} on_select={set_sort_key} />
            <ColumnHeader label="Rtg" sort_key="rating" current={sort_key} on_select={set_sort_key} />
            <span style={{ textAlign: "center" }}>Trend</span>
            <ColumnHeader label="Age" sort_key="age" current={sort_key} on_select={set_sort_key} />
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {filtered.map(p => {
              const team = teams_api.get(p.team_id);
              const watched = watchlist?.has(p.id) ?? false;
              const held = held_ids.has(p.id);
              const up = p.valuation.change_24h >= 0;
              return (
                <div
                  key={p.id}
                  onClick={() => on_open_player(p)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "32px 1fr 80px 60px 70px 60px 50px 110px 70px",
                    padding: "11px 16px",
                    borderBottom: "1px solid rgba(255,255,255,.025)",
                    cursor: "pointer",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13,
                    transition: "background .1s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,.03)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <span
                    onClick={e => {
                      e.stopPropagation();
                      toggle_watch?.(p.id);
                    }}
                    style={{
                      fontSize: 16,
                      color: watched ? "#fff" : "rgba(255,255,255,.15)",
                      cursor: "pointer",
                      lineHeight: 1,
                    }}
                  >
                    {watched ? "★" : "☆"}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <PlayerChip jersey_number={p.jersey_number} team_color={team?.color ?? "#666"} size={32} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 6 }}>
                        {p.name}
                        {held && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.5)", background: "rgba(255,255,255,.06)", padding: "1px 5px", borderRadius: 3 }}>
                            HELD
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,.25)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {p.club ?? "—"}
                      </div>
                    </div>
                  </div>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(255,255,255,.55)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    <span style={{ fontSize: 14 }}>{team?.flag}</span>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{team?.name}</span>
                  </span>
                  <PositionBadge position={p.position} />
                  <span className="mono" style={{ fontWeight: 700 }}>€{p.valuation.current_price}M</span>
                  <span className="mono" style={{ fontWeight: 700, color: up ? "#37ff63" : "#ff285d" }}>
                    {up ? "+" : ""}{p.valuation.change_24h}%
                  </span>
                  <span className="mono" style={{ fontWeight: 700, color: "rgba(255,255,255,.65)" }}>{p.valuation.performance_rating}</span>
                  <Spark data={gen_spark(p.valuation.change_24h, p.id, 16)} color={up ? "#37ff63" : "#ff285d"} width={100} height={24} />
                  <span className="mono" style={{ color: "rgba(255,255,255,.45)" }}>{p.age ?? "—"}</span>
                </div>
              );
            })}
          </div>
          {filtered.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,.25)", fontSize: 13 }}>
              No players match your filters
            </div>
          )}
        </div>
        <div style={{ padding: "10px 4px 0", fontSize: 11, color: "rgba(255,255,255,.35)" }}>
          {filtered.length} players
        </div>
      </div>
    </div>
  );
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: "rgba(255,255,255,.35)",
        letterSpacing: 0.5,
        textTransform: "uppercase",
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function ColumnHeader({
  label,
  sort_key,
  current,
  on_select,
}: {
  label: string;
  sort_key: SortKey;
  current: SortKey;
  on_select: (k: SortKey) => void;
}) {
  const active = current === sort_key;
  return (
    <span
      onClick={() => on_select(sort_key)}
      style={{
        cursor: "pointer",
        color: active ? "#fff" : "rgba(255,255,255,.45)",
        fontWeight: active ? 800 : 700,
        userSelect: "none",
      }}
    >
      {label}
      {active ? " ↓" : ""}
    </span>
  );
}
