import { useMemo, useState } from "react";
import { players_api } from "@/api/players_api";
import { portfolio_api } from "@/api/portfolio_api";
import { teams_api } from "@/api/teams_api";
import type { Player, Position } from "@/domain/player/player";
import { POSITION_LABEL } from "@/domain/player/player";
import { PlayerChip } from "@/ui/components/PlayerChip";
import { PositionBadge } from "@/ui/components/PositionBadge";
import { Spark } from "@/ui/components/Spark";
import {
  refresh_screener_repository,
  screener_repository,
  type ScreenerEntry,
} from "@/infrastructure/repositories/screener_repository";
import { useLiveRefetch, usePricesLiveVersion } from "@/ui/hooks/use_live_updates";
import { pulse_class, usePulse } from "@/ui/hooks/use_pulse";
import { spark_for_player } from "@/infrastructure/repositories/valuations_repository";
import { color_for_sign, fmt_signed_pct, price_label } from "@/ui/helpers/format";
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

type Tab = "valuation" | "statistics" | "personal";
type SortDir = "asc" | "desc";

type SortKey =
  | "name"
  | "team"
  | "position"
  | "value"
  | "change_24h"
  | "pnl"
  | "since_start"
  | "last_match"
  | "avg_match"
  | "appearances"
  | "minutes_played"
  | "goals"
  | "assists"
  | "shots"
  | "rating_avg"
  | "age"
  | "foot"
  | "height"
  | "weight";

type ColumnKey = SortKey | "spark";

interface ColumnDef {
  key: ColumnKey;
  label: string;
  width: string;
  align?: "left" | "center" | "right";
  sortable?: boolean; // defaults to true; spark is false
}

// Variable columns by tab. The identity block (★ + Player + Team + Pos +
// Value) stays fixed across tabs — switching the tab swaps only these
// trailing columns. Sort state is preserved across tabs (the underlying
// dataset is unchanged; column visibility is purely cosmetic).
const TABS: Record<Tab, ColumnDef[]> = {
  valuation: [
    { key: "since_start", label: "All-time", width: "75px", align: "right" },
    { key: "last_match", label: "Last Match", width: "85px", align: "right" },
    { key: "avg_match", label: "Avg / Match", width: "90px", align: "right" },
    { key: "spark", label: "Trend", width: "100px", align: "left", sortable: false },
  ],
  statistics: [
    { key: "appearances", label: "Apps", width: "50px", align: "right" },
    { key: "minutes_played", label: "Min", width: "55px", align: "right" },
    { key: "goals", label: "G", width: "40px", align: "right" },
    { key: "assists", label: "A", width: "40px", align: "right" },
    { key: "shots", label: "Shots", width: "55px", align: "right" },
    { key: "rating_avg", label: "Rate", width: "55px", align: "right" },
  ],
  personal: [
    { key: "age", label: "Age", width: "45px", align: "right" },
    { key: "foot", label: "Foot", width: "65px", align: "right" },
    { key: "height", label: "Ht", width: "60px", align: "right" },
    { key: "weight", label: "Wt", width: "60px", align: "right" },
  ],
};

const STAR_W = 28;
const PLAYER_W = 210;
const TEAM_W = 115;
const POS_W = 60;
const VALUE_W = 80;
const ROW_GAP = 8;

interface ScreenerPageProps {
  on_open_player: (player: Player) => void;
  watchlist?: Set<number>;
  toggle_watch?: (id: number) => void;
}

export function ScreenerPage({ on_open_player, watchlist, toggle_watch }: ScreenerPageProps) {
  const [position_filters, set_position_filters] = useState<Set<Position>>(new Set());
  const [team_filters, set_team_filters] = useState<Set<string>>(new Set());
  const [price_range, set_price_range] = useState<[number, number]>([0, 999]);
  const [search, set_search] = useState("");
  const [show_filters, set_show_filters] = useState(false);
  const [tab, set_tab] = useState<Tab>("valuation");
  const [sort_key, set_sort_key] = useState<SortKey>("value");
  const [sort_dir, set_sort_dir] = useState<SortDir>("desc");

  // Live: re-fetch screener data on every global price tick so prices /
  // change_24h / per-match deltas reflect what just happened on the pitch.
  const [data_version, set_data_version] = useState(0);
  useLiveRefetch(usePricesLiveVersion(), () => {
    void refresh_screener_repository().then(() => set_data_version(v => v + 1));
  });
  const all_entries = useMemo(() => screener_repository.find_all(), [data_version]);
  const all_team_ids = useMemo(
    () => Array.from(new Set(all_entries.map(e => e.team_id))),
    [all_entries],
  );
  const sorted_team_ids = useMemo(
    () =>
      [...all_team_ids].sort((a, b) => {
        const na = teams_api.get(a)?.name ?? a;
        const nb = teams_api.get(b)?.name ?? b;
        return na.localeCompare(nb);
      }),
    [all_team_ids],
  );
  const my_holdings = useMemo(() => portfolio_api.get_holdings(), []);
  const held_ids = useMemo(() => new Set(my_holdings.map(h => h.player_id)), [my_holdings]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = all_entries.filter(e => {
      if (position_filters.size > 0 && !position_filters.has(e.position as Position)) return false;
      if (team_filters.size > 0 && !team_filters.has(e.team_id)) return false;
      if (e.current_price < price_range[0] || e.current_price > price_range[1]) return false;
      if (q) {
        const team = teams_api.get(e.team_id);
        const hay = `${e.name} ${e.full_name ?? ""} ${e.club ?? ""} ${team?.name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const dir = sort_dir === "asc" ? 1 : -1;
    result.sort((a, b) => {
      const va = pluck(a, sort_key);
      const vb = pluck(b, sort_key);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "string" && typeof vb === "string") return dir * va.localeCompare(vb);
      return dir * ((va as number) - (vb as number));
    });
    return result;
  }, [all_entries, position_filters, team_filters, price_range, search, sort_key, sort_dir]);

  const has_filters =
    position_filters.size > 0 || team_filters.size > 0 || price_range[0] > 0 || price_range[1] < 999;
  const active_count =
    position_filters.size + team_filters.size + (price_range[0] > 0 || price_range[1] < 999 ? 1 : 0);

  const columns = TABS[tab];
  const variable_template = columns.map(c => c.width).join(" ");
  const grid_template = `${STAR_W}px ${PLAYER_W}px ${TEAM_W}px ${POS_W}px ${VALUE_W}px ${variable_template}`;

  const set_sort = (key: SortKey) => {
    if (sort_key === key) {
      set_sort_dir(sort_dir === "asc" ? "desc" : "asc");
    } else {
      set_sort_key(key);
      set_sort_dir("desc");
    }
  };

  const open_player_by_id = (id: number) => {
    const p = players_api.get(id);
    if (p) on_open_player(p);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, animation: "fu .3s ease" }}>
      {/* Search + filter toggle */}
      <div style={{ display: "flex", gap: 8 }}>
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

      {/* Filter panel: header (title + Reset on right) then Position+Price
          on a row, then all teams alphabetically as a single flat list. */}
      {show_filters && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            padding: "14px 16px",
            background: "rgba(255,255,255,.02)",
            border: "1px solid rgba(255,255,255,.04)",
            borderRadius: 12,
          }}
        >
          {/* Header — title left + Reset all right (always rendered) */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.55)", letterSpacing: 0.5, textTransform: "uppercase" }}>
              Filters
            </span>
            <button
              onClick={() => {
                set_position_filters(new Set());
                set_team_filters(new Set());
                set_price_range([0, 999]);
              }}
              disabled={!has_filters}
              style={{
                background: has_filters ? "rgba(255,255,255,.04)" : "transparent",
                border: "1px solid rgba(255,255,255,.06)",
                color: has_filters ? "rgba(255,255,255,.7)" : "rgba(255,255,255,.2)",
                fontSize: 11,
                fontWeight: 600,
                cursor: has_filters ? "pointer" : "default",
                fontFamily: "inherit",
                padding: "5px 12px",
                borderRadius: 6,
              }}
            >
              Reset all{has_filters ? ` (${active_count})` : ""}
            </button>
          </div>

          {/* Position + Price on one row */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 28, flexWrap: "wrap" }}>
            <div>
              <FilterLabel>Position</FilterLabel>
              <div style={{ display: "flex", gap: 6 }}>
                {(["FW", "MF", "DF", "GK"] as Position[]).map(p => {
                  const on = position_filters.has(p);
                  return (
                    <button
                      key={p}
                      onClick={() => toggle_set(position_filters, set_position_filters, p)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        border: on ? "1px solid rgba(255,255,255,.22)" : "1px solid rgba(255,255,255,.06)",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        background: on ? position_color[p] + "22" : "rgba(255,255,255,.02)",
                        color: on ? "#fff" : "rgba(255,255,255,.4)",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <div style={{ width: 6, height: 6, borderRadius: 2, background: position_color[p], opacity: on ? 1 : 0.4 }} />
                      {POSITION_LABEL[p]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <FilterLabel>Price range</FilterLabel>
              <div style={{ display: "flex", gap: 4 }}>
                {([[0, 30], [30, 60], [60, 100], [100, 150], [150, 999]] as [number, number][]).map(([lo, hi]) => {
                  const active = price_range[0] === lo && price_range[1] === hi;
                  return (
                    <button
                      key={lo}
                      onClick={() => set_price_range(active ? [0, 999] : [lo, hi])}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        border: "1px solid " + (active ? "rgba(255,255,255,.22)" : "rgba(255,255,255,.06)"),
                        cursor: "pointer",
                        fontFamily: "inherit",
                        background: active ? "rgba(255,255,255,.08)" : "transparent",
                        color: active ? "#fff" : "rgba(255,255,255,.4)",
                      }}
                    >
                      {price_label(lo)}–{price_label(hi)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Teams — flat alphabetical list, no confederation grouping */}
          <div>
            <FilterLabel>Teams</FilterLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {sorted_team_ids.map(id => {
                const team = teams_api.get(id);
                if (!team) return null;
                const on = team_filters.has(id);
                return (
                  <button
                    key={id}
                    onClick={() => toggle_set(team_filters, set_team_filters, id)}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 5,
                      fontSize: 11,
                      fontWeight: 600,
                      border: "1px solid " + (on ? "rgba(255,255,255,.22)" : "rgba(255,255,255,.06)"),
                      cursor: "pointer",
                      fontFamily: "inherit",
                      background: on ? "rgba(255,255,255,.08)" : "transparent",
                      color: on ? "#fff" : "rgba(255,255,255,.55)",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <span style={{ fontSize: 12 }}>{team.flag}</span>
                    <span>{team.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4 }}>
        {(["valuation", "statistics", "personal"] as Tab[]).map(t => {
          const active = tab === t;
          return (
            <button
              key={t}
              onClick={() => set_tab(t)}
              style={{
                padding: "8px 14px",
                border: "1px solid rgba(255,255,255,.06)",
                background: active ? "rgba(255,255,255,.06)" : "transparent",
                color: active ? "#fff" : "rgba(255,255,255,.45)",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                borderRadius: 8,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {t}
            </button>
          );
        })}
      </div>

      {/* Result table — compact widths so everything fits without scroll. */}
      <div
        style={{
          background: "rgba(255,255,255,.02)",
          border: "1px solid rgba(255,255,255,.04)",
          borderRadius: 12,
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: grid_template,
            padding: "10px 16px",
            borderBottom: "1px solid rgba(255,255,255,.06)",
            fontSize: 10,
            fontWeight: 700,
            color: "rgba(255,255,255,.45)",
            letterSpacing: 0.5,
            textTransform: "uppercase",
            alignItems: "center",
            gap: ROW_GAP,
            background: "rgba(255,255,255,.02)",
          }}
        >
          <span />
          <ColumnHeader label="Player" sort_key="name" current={sort_key} dir={sort_dir} on_select={set_sort} />
          <ColumnHeader label="Team" sort_key="team" current={sort_key} dir={sort_dir} on_select={set_sort} />
          <ColumnHeader label="Pos" sort_key="position" current={sort_key} dir={sort_dir} on_select={set_sort} />
          <ColumnHeader label="Value" sort_key="value" current={sort_key} dir={sort_dir} on_select={set_sort} align="right" />
          {columns.map(c => (
            <ColumnHeader
              key={c.key}
              label={c.label}
              sort_key={c.key === "spark" ? null : c.key}
              current={sort_key}
              dir={sort_dir}
              on_select={set_sort}
              align={c.align}
            />
          ))}
        </div>

        {/* Body */}
        <div
          className="scroll-visible"
          style={{ display: "flex", flexDirection: "column", maxHeight: 640, overflowY: "auto" }}
        >
          {filtered.map(e => {
            const team = teams_api.get(e.team_id);
            const watched = watchlist?.has(e.id) ?? false;
            const held = held_ids.has(e.id);
            return (
              <Row
                key={e.id}
                entry={e}
                team_color={team?.color ?? "#666"}
                team_flag={team?.flag}
                team_flag_url={team?.flag_url}
                team_name={team?.name}
                watched={watched}
                held={held}
                grid_template={grid_template}
                columns={columns}
                on_open={() => open_player_by_id(e.id)}
                on_toggle_watch={() => toggle_watch?.(e.id)}
              />
            );
          })}
        </div>
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,.25)", fontSize: 13 }}>
            No players match your filters
          </div>
        )}
      </div>
      <div style={{ padding: "0 4px", fontSize: 11, color: "rgba(255,255,255,.35)" }}>
        {filtered.length} players
      </div>
    </div>
  );
}

interface RowProps {
  entry: ScreenerEntry;
  team_color: string;
  team_flag?: string;
  team_flag_url?: string;
  team_name?: string;
  watched: boolean;
  held: boolean;
  grid_template: string;
  columns: ColumnDef[];
  on_open: () => void;
  on_toggle_watch: () => void;
}

/** Player price cell with a one-shot Bloomberg-style pulse on change.
 * The hue (green/red) is derived from the direction; we just toggle a
 * className for ~700ms via ``usePulse``. */
function PriceCell({ value }: { value: number }) {
  const pulse = usePulse(value);
  return (
    <span
      className={`mono ${pulse_class(pulse)}`}
      style={{ fontWeight: 700, textAlign: "right", whiteSpace: "nowrap", display: "block", padding: "1px 4px" }}
    >
      €{value.toFixed(2)}M
    </span>
  );
}

function Row({
  entry: e,
  team_color,
  team_flag,
  team_flag_url,
  team_name,
  watched,
  held,
  grid_template,
  columns,
  on_open,
  on_toggle_watch,
}: RowProps) {
  return (
    <div
      onClick={on_open}
      onMouseEnter={ev => (ev.currentTarget.style.background = "rgba(255,255,255,.03)")}
      onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}
      style={{
        display: "grid",
        gridTemplateColumns: grid_template,
        padding: "10px 16px",
        borderBottom: "1px solid rgba(255,255,255,.025)",
        cursor: "pointer",
        alignItems: "center",
        gap: ROW_GAP,
        fontSize: 13,
        background: "transparent",
        transition: "background .1s",
      }}
    >
      <span
        onClick={ev => {
          ev.stopPropagation();
          on_toggle_watch();
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          minWidth: 0,
        }}
      >
        {e.image_path ? (
          <img
            src={e.image_path}
            alt={e.full_name ?? e.name}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              objectFit: "contain",
              background: "rgba(255,255,255,.05)",
              border: "1px solid rgba(255,255,255,.08)",
              flexShrink: 0,
            }}
          />
        ) : (
          <PlayerChip jersey_number={e.jersey_number} team_color={team_color} size={36} />
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <span
              className="mono"
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "rgba(255,255,255,.45)",
                flexShrink: 0,
              }}
            >
              {e.jersey_number}
            </span>
            <span
              style={{
                fontWeight: 700,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                minWidth: 0,
              }}
            >
              {e.name}
            </span>
            {held && (
              <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.5)", background: "rgba(255,255,255,.06)", padding: "1px 5px", borderRadius: 3, flexShrink: 0 }}>
                HELD
              </span>
            )}
          </div>
          {e.club && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.25)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {e.club}
            </div>
          )}
        </div>
      </div>
      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(255,255,255,.55)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
        {team_flag_url ? (
          <img src={team_flag_url} alt={team_name ?? ""} style={{ width: 18, height: 18, objectFit: "contain", flexShrink: 0 }} />
        ) : (
          <span style={{ fontSize: 14 }}>{team_flag}</span>
        )}
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{team_name}</span>
      </span>
      <PositionBadge position={e.position as Position} />
      <PriceCell value={e.current_price} />
      {columns.map(c => (
        <ScreenerCell key={c.key} entry={e} column={c} />
      ))}
    </div>
  );
}

function pluck(e: ScreenerEntry, key: SortKey): number | string | null {
  switch (key) {
    case "name":
      return e.name;
    case "team":
      return e.team_id;
    case "position":
      return e.position;
    case "value":
      return e.current_price;
    case "change_24h":
      return e.change_24h;
    case "pnl":
      return e.pnl;
    case "since_start":
      return e.since_start_pct;
    case "last_match":
      return e.last_match_pct;
    case "avg_match":
      return e.avg_match_pct;
    case "appearances":
      return e.appearances;
    case "minutes_played":
      return e.minutes_played;
    case "goals":
      return e.goals;
    case "assists":
      return e.assists;
    case "shots":
      return e.shots_total;
    case "rating_avg":
      return e.rating_avg;
    case "age":
      return e.age;
    case "foot":
      return e.foot;
    case "height":
      return e.height;
    case "weight":
      return e.weight;
  }
}

function fmt_pct(v: number | null): string {
  if (v === null) return "—";
  return `${fmt_signed_pct(v, 1)}`;
}

function fmt_int(v: number | null): string {
  return v === null ? "—" : String(v);
}

function pct_color(v: number | null): string | undefined {
  if (v === null) return undefined;
  return color_for_sign(v);
}

function ScreenerCell({ entry: e, column: c }: { entry: ScreenerEntry; column: ColumnDef }) {
  const align = c.align ?? "left";
  const base_style: React.CSSProperties = {
    fontWeight: 700,
    textAlign: align,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "block",
  };
  switch (c.key) {
    case "spark":
      return <Spark data={spark_for_player(e.id)} width={96} height={22} />;
    case "pnl":
      return (
        <span
          className="mono"
          style={{
            ...base_style,
            color: e.pnl == null ? "rgba(255,255,255,.3)" : color_for_sign(e.pnl),
          }}
        >
          {e.pnl == null ? "—" : `${e.pnl >= 0 ? "+" : ""}${e.pnl.toFixed(2)}M`}
        </span>
      );
    case "since_start":
      return (
        <span className="mono" style={{ ...base_style, color: pct_color(e.since_start_pct) ?? "#fff" }}>
          {fmt_pct(e.since_start_pct)}
        </span>
      );
    case "last_match":
      return (
        <span className="mono" style={{ ...base_style, color: pct_color(e.last_match_pct) ?? "#fff" }}>
          {fmt_pct(e.last_match_pct)}
        </span>
      );
    case "avg_match":
      return (
        <span className="mono" style={{ ...base_style, color: pct_color(e.avg_match_pct) ?? "#fff" }}>
          {fmt_pct(e.avg_match_pct)}
        </span>
      );
    case "appearances":
      return <span className="mono" style={base_style}>{fmt_int(e.appearances)}</span>;
    case "minutes_played":
      return <span className="mono" style={base_style}>{fmt_int(e.minutes_played)}</span>;
    case "goals":
      return (
        <span className="mono" style={{ ...base_style, color: (e.goals ?? 0) > 0 ? "var(--color-positive)" : undefined }}>
          {fmt_int(e.goals)}
        </span>
      );
    case "assists":
      return (
        <span className="mono" style={{ ...base_style, color: (e.assists ?? 0) > 0 ? "var(--color-positive)" : undefined }}>
          {fmt_int(e.assists)}
        </span>
      );
    case "shots":
      return (
        <span className="mono" style={base_style}>
          {e.shots_on_target ?? 0}/{e.shots_total ?? 0}
        </span>
      );
    case "rating_avg":
      return <span className="mono" style={base_style}>{e.rating_avg != null ? e.rating_avg.toFixed(2) : "—"}</span>;
    case "age":
      return <span className="mono" style={base_style}>{fmt_int(e.age)}</span>;
    case "foot":
      return <span style={{ ...base_style, color: "rgba(255,255,255,.7)" }}>{e.foot ?? "—"}</span>;
    case "height":
      return <span className="mono" style={base_style}>{e.height != null ? `${e.height}cm` : "—"}</span>;
    case "weight":
      return <span className="mono" style={base_style}>{e.weight != null ? `${e.weight}kg` : "—"}</span>;
    default:
      return <span style={base_style}>—</span>;
  }
}

function FilterLabel({ children, inline }: { children: React.ReactNode; inline?: boolean }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: "rgba(255,255,255,.35)",
        letterSpacing: 0.5,
        textTransform: "uppercase",
        marginBottom: inline ? 0 : 8,
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
  dir,
  on_select,
  align = "left",
}: {
  label: string;
  sort_key: SortKey | null;
  current: SortKey;
  dir: SortDir;
  on_select: (k: SortKey) => void;
  align?: "left" | "center" | "right";
}) {
  const sortable = sort_key !== null;
  const active = sortable && current === sort_key;
  return (
    <span
      onClick={sortable ? () => on_select(sort_key) : undefined}
      style={{
        cursor: sortable ? "pointer" : "default",
        userSelect: "none",
        color: active ? "#fff" : undefined,
        textAlign: align,
        display: "block",
      }}
    >
      {label}
      {active && (dir === "asc" ? " ▲" : " ▼")}
    </span>
  );
}
