import { useMemo, useState, type ReactNode } from "react";
import { players_api } from "@fundxi/core/api/players_api";
import { portfolio_api } from "@fundxi/core/api/portfolio_api";
import { teams_api } from "@fundxi/core/api/teams_api";
import type { Player, Position } from "@fundxi/core/domain/player/player";
import { POSITION_LABEL } from "@fundxi/core/domain/player/player";
import { PlayerAvatar } from "@/ui/components/PlayerAvatar";
import { PositionBadge } from "@/ui/components/PositionBadge";
import { Spark } from "@/ui/components/Spark";
import { TeamLink } from "@/ui/components/TeamLink";
import {
  refresh_screener_repository,
  screener_repository,
  type ScreenerEntry,
} from "@fundxi/core/infrastructure/repositories/screener_repository";
import { useLiveRefetch, usePricesLiveVersion } from "@/ui/hooks/use_live_updates";
import { pulse_class, usePulse } from "@/ui/hooks/use_pulse";
import { spark_for_player } from "@fundxi/core/infrastructure/repositories/valuations_repository";
import {
  filter_screener_entries,
  screener_bounds,
  type Range,
  type ScreenerSortKey,
} from "@fundxi/core/application/screener_filter";
import { color_for_sign, fmt_signed_pct } from "@/ui/helpers/format";
import { toggle_set } from "@/ui/helpers/state";
import { color } from "@/ui/design/tokens";
import { useViewport } from "@/ui/hooks/use_viewport";
import { ScreenerFilters, type ActiveChip } from "./ScreenerFilters";

const PRICE_STEP = 5;
const PERF_STEP = 5;

type Tab = "valuation" | "statistics" | "personal";
type SortDir = "asc" | "desc";

// Sort keys = the shared union from the core screener filter (web + mobile).
type SortKey = ScreenerSortKey;

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
    { key: "appearances", label: "Apps", width: "46px", align: "right" },
    { key: "minutes_played", label: "Min", width: "46px", align: "right" },
    { key: "goals", label: "Goals", width: "54px", align: "right" },
    { key: "assists", label: "Assists", width: "60px", align: "right" },
    { key: "shots", label: "Shots", width: "52px", align: "right" },
    { key: "yellow_cards", label: "🟨", width: "38px", align: "right" },
    { key: "red_cards", label: "🟥", width: "38px", align: "right" },
    { key: "key_passes", label: "Key P", width: "48px", align: "right" },
    { key: "passes", label: "Passes", width: "58px", align: "right" },
    { key: "passes_accuracy", label: "Pass %", width: "56px", align: "right" },
    { key: "rating_avg", label: "Rating", width: "54px", align: "right" },
  ],
  personal: [
    { key: "age", label: "Age", width: "45px", align: "right" },
    { key: "foot", label: "Foot", width: "65px", align: "right" },
    { key: "height", label: "Ht", width: "60px", align: "right" },
    { key: "weight", label: "Wt", width: "60px", align: "right" },
  ],
};

// Per-tab sort options for the mobile sort control (mirrors the native
// TAB_SORTS in apps/mobile/app/(tabs)/screener.tsx). On desktop the clickable
// column headers play this role; on a phone there are no headers, so the same
// sort keys are exposed through a compact <select>.
const MOBILE_TAB_SORTS: Record<Tab, { key: SortKey; label: string }[]> = {
  valuation: [
    { key: "value", label: "Value" },
    { key: "since_start", label: "All-time %" },
    { key: "last_match", label: "Last match %" },
    { key: "avg_match", label: "Avg / match %" },
    { key: "name", label: "Name" },
  ],
  statistics: [
    { key: "value", label: "Value" },
    { key: "rating_avg", label: "Rating" },
    { key: "appearances", label: "Apps" },
    { key: "minutes_played", label: "Minutes" },
    { key: "goals", label: "Goals" },
    { key: "assists", label: "Assists" },
    { key: "key_passes", label: "Key passes" },
    { key: "shots", label: "Shots" },
    { key: "passes", label: "Passes" },
    { key: "passes_accuracy", label: "Pass %" },
    { key: "name", label: "Name" },
  ],
  personal: [
    { key: "value", label: "Value" },
    { key: "age", label: "Age" },
    { key: "height", label: "Height" },
    { key: "weight", label: "Weight" },
    { key: "name", label: "Name" },
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
  on_open_team?: (team_id: string) => void;
  watchlist?: Set<number>;
  toggle_watch?: (id: number) => void;
}

export function ScreenerPage({ on_open_player, on_open_team, watchlist, toggle_watch }: ScreenerPageProps) {
  const { is_mobile } = useViewport();
  const [position_filters, set_position_filters] = useState<Set<Position>>(new Set());
  const [team_filters, set_team_filters] = useState<Set<string>>(new Set());
  // null ⇒ filter inactive (full range). Sliders read the computed bounds.
  // Same union as mobile, fed to the shared predicate.
  const [price_range, set_price_range] = useState<Range | null>(null);
  const [perf_range, set_perf_range] = useState<Range | null>(null);
  const [age_range, set_age_range] = useState<Range | null>(null);
  const [held_only, set_held_only] = useState(false);
  const [watch_only, set_watch_only] = useState(false);
  const [search, set_search] = useState("");
  const [show_filters, set_show_filters] = useState(false);
  const [tab, set_tab] = useState<Tab>("valuation");
  const [sort_key, set_sort_key] = useState<SortKey>("value");
  const [sort_dir, set_sort_dir] = useState<SortDir>("desc");

  // Live: re-fetch screener data on every global price tick so prices /
  // total / per-match deltas reflect what just happened on the pitch.
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

  // Slider bounds derived from the live dataset — never hardcoded ranges
  // (same approach as the native filter sheet).
  const price_max = useMemo(() => {
    const m = all_entries.reduce((a, e) => Math.max(a, e.current_price), 0);
    return Math.max(PRICE_STEP, Math.ceil(m / PRICE_STEP) * PRICE_STEP);
  }, [all_entries]);
  const price_bounds: Range = [0, price_max];
  const perf_bounds = useMemo<Range>(
    () => screener_bounds(all_entries, e => e.since_start_pct, PERF_STEP, [-50, 100]),
    [all_entries],
  );
  const age_bounds = useMemo<Range>(
    () => screener_bounds(all_entries, e => e.age, 1, [16, 45]),
    [all_entries],
  );

  const filtered = useMemo(
    () =>
      filter_screener_entries(
        all_entries,
        { positions: position_filters, team_ids: team_filters, price_range, perf_range, age_range, held_only, watch_only, search, sort_key, sort_dir },
        { team_name: id => teams_api.get(id)?.name, held_ids, watched_ids: watchlist },
      ),
    [all_entries, position_filters, team_filters, price_range, perf_range, age_range, held_only, watch_only, search, sort_key, sort_dir, held_ids, watchlist],
  );

  const active_count =
    position_filters.size +
    team_filters.size +
    (price_range ? 1 : 0) +
    (perf_range ? 1 : 0) +
    (age_range ? 1 : 0) +
    (held_only ? 1 : 0) +
    (watch_only ? 1 : 0);
  const has_filters = active_count > 0;

  const reset_filters = () => {
    set_position_filters(new Set());
    set_team_filters(new Set());
    set_price_range(null);
    set_perf_range(null);
    set_age_range(null);
    set_held_only(false);
    set_watch_only(false);
  };

  // Removable chips surfaced on the main screen + inside the filter sheet.
  const active_chips: ActiveChip[] = [
    ...Array.from(position_filters).map(p => ({
      key: `pos:${p}`,
      label: POSITION_LABEL[p],
      clear: () => toggle_set(position_filters, set_position_filters, p),
    })),
    ...(price_range
      ? [{ key: "price", label: `€${price_range[0]}M–€${price_range[1]}M`, clear: () => set_price_range(null) }]
      : []),
    ...(perf_range
      ? [{ key: "perf", label: `${perf_range[0] >= 0 ? "+" : ""}${perf_range[0]}%–${perf_range[1] >= 0 ? "+" : ""}${perf_range[1]}%`, clear: () => set_perf_range(null) }]
      : []),
    ...(age_range ? [{ key: "age", label: `${age_range[0]}–${age_range[1]} yrs`, clear: () => set_age_range(null) }] : []),
    ...Array.from(team_filters).map(id => {
      const t = teams_api.get(id);
      return {
        key: `team:${id}`,
        label: t?.name ?? id,
        flag: t?.flag,
        flag_url: t?.flag_url,
        clear: () => toggle_set(team_filters, set_team_filters, id),
      };
    }),
    ...(held_only ? [{ key: "held", label: "In portfolio", clear: () => set_held_only(false) }] : []),
    ...(watch_only ? [{ key: "watch", label: "★ Watchlist", clear: () => set_watch_only(false) }] : []),
  ];

  const columns = TABS[tab];
  // Every column except the star is a proportional ``minmax(0, Nfr)``
  // track — the per-column px numbers become fr weights. The grid is
  // therefore ALWAYS exactly the container width: it fits any screen
  // without a horizontal scrollbar and without clipping; columns just
  // scale together. The star stays a fixed icon width.
  const grid_template =
    `${STAR_W}px ` +
    [PLAYER_W, TEAM_W, POS_W, VALUE_W, ...columns.map(c => parseInt(c.width, 10))]
      .map(w => `minmax(0, ${w}fr)`)
      .join(" ");

  const set_sort = (key: SortKey) => {
    if (sort_key === key) {
      set_sort_dir(sort_dir === "asc" ? "desc" : "asc");
    } else {
      set_sort_key(key);
      set_sort_dir("desc");
    }
  };

  // On mobile the sort lives in a <select> scoped to the tab's options, so a
  // tab switch must fall back to a valid key (e.g. "minutes" -> personal tab).
  // Desktop keeps any sort across tabs (its column headers are unaffected).
  const change_tab = (t: Tab) => {
    set_tab(t);
    if (is_mobile && !MOBILE_TAB_SORTS[t].some(o => o.key === sort_key)) {
      set_sort_key("value");
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

      {/* Active filter chips on the main screen (removable). */}
      {active_chips.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {active_chips.map(c => (
            <button
              key={c.key}
              type="button"
              onClick={c.clear}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 9px",
                borderRadius: 8,
                border: "1px solid rgba(47,107,255,.6)",
                background: color.accentBlueSoft,
                color: "#fff",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {c.flag_url ? (
                <img src={c.flag_url} alt="" style={{ width: 14, height: 14, objectFit: "contain" }} />
              ) : c.flag ? (
                <span style={{ fontSize: 12 }}>{c.flag}</span>
              ) : null}
              <span>{c.label}</span>
              <span style={{ fontSize: 10, opacity: 0.7 }}>✕</span>
            </button>
          ))}
        </div>
      )}

      {/* Filter sheet (centred modal on desktop, bottom-sheet on phone) —
          sliders + chips + country search, mirroring the native filter. */}
      <ScreenerFilters
        open={show_filters}
        on_close={() => set_show_filters(false)}
        result_count={filtered.length}
        active_count={active_count}
        has_filters={has_filters}
        on_reset={reset_filters}
        active_chips={active_chips}
        position_filters={position_filters}
        set_position_filters={set_position_filters}
        price_bounds={price_bounds}
        price_max={price_max}
        price_range={price_range}
        set_price_range={set_price_range}
        perf_bounds={perf_bounds}
        perf_range={perf_range}
        set_perf_range={set_perf_range}
        age_bounds={age_bounds}
        age_range={age_range}
        set_age_range={set_age_range}
        team_filters={team_filters}
        set_team_filters={set_team_filters}
        sorted_team_ids={sorted_team_ids}
        held_only={held_only}
        set_held_only={set_held_only}
        watch_only={watch_only}
        set_watch_only={set_watch_only}
      />

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4 }}>
        {(["valuation", "statistics", "personal"] as Tab[]).map(t => {
          const active = tab === t;
          return (
            <button
              key={t}
              onClick={() => change_tab(t)}
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

      {/* Mobile: a compact sort control replaces the clickable column headers. */}
      {is_mobile && (
        <MobileSortControl
          options={MOBILE_TAB_SORTS[tab]}
          sort_key={sort_key}
          sort_dir={sort_dir}
          on_change_key={k => {
            set_sort_key(k);
            set_sort_dir("desc");
          }}
          on_toggle_dir={() => set_sort_dir(d => (d === "asc" ? "desc" : "asc"))}
        />
      )}

      {/* Mobile: vertical list of compact player cards (mirrors the native
          Screener). Desktop: the wide grid table below. */}
      {is_mobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(e => {
            const team = teams_api.get(e.team_id);
            return (
              <MobileCard
                key={e.id}
                entry={e}
                tab={tab}
                team_color={team?.color ?? "#666"}
                team_flag={team?.flag}
                team_flag_url={team?.flag_url}
                team_name={team?.name}
                watched={watchlist?.has(e.id) ?? false}
                held={held_ids.has(e.id)}
                on_open={() => open_player_by_id(e.id)}
                on_open_team={on_open_team}
                on_toggle_watch={() => toggle_watch?.(e.id)}
              />
            );
          })}
          {filtered.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,.25)", fontSize: 13 }}>
              No players match your filters
            </div>
          )}
        </div>
      ) : (
      /* Result table — compact widths so everything fits without scroll. */
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
                on_open_team={on_open_team}
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
      )}
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
  on_open_team?: (team_id: string) => void;
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
  on_open_team,
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
        <PlayerAvatar
          image_path={e.image_path}
          jersey_number={e.jersey_number}
          team_color={team_color}
          size={36}
          radius={8}
          fit="contain"
          alt={e.full_name ?? e.name}
        />
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
              <span
                title="In your portfolio"
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: 0.4,
                  color: "var(--color-positive)",
                  background: "color-mix(in srgb, var(--color-positive) 14%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--color-positive) 35%, transparent)",
                  padding: "1px 5px",
                  borderRadius: 3,
                  flexShrink: 0,
                }}
              >
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
      <TeamLink
        team_id={e.team_id}
        on_open_team={on_open_team}
        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(255,255,255,.55)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}
      >
        {team_flag_url ? (
          <img src={team_flag_url} alt={team_name ?? ""} style={{ width: 18, height: 18, objectFit: "contain", flexShrink: 0 }} />
        ) : (
          <span style={{ fontSize: 14 }}>{team_flag}</span>
        )}
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{team_name}</span>
      </TeamLink>
      <PositionBadge position={e.position as Position} />
      <PriceCell value={e.current_price} />
      {columns.map(c => (
        <ScreenerCell key={c.key} entry={e} column={c} />
      ))}
    </div>
  );
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
        <span
          className="mono"
          style={base_style}
          title={`${e.shots_on_target ?? 0} on target · ${e.shots_total ?? 0} total`}
        >
          {e.shots_on_target ?? 0}/{e.shots_total ?? 0}
        </span>
      );
    case "yellow_cards":
      return (
        <span className="mono" style={base_style} title="Yellow cards">
          {fmt_int(e.yellow_cards)}
        </span>
      );
    case "red_cards":
      return (
        <span
          className="mono"
          style={{ ...base_style, color: (e.red_cards ?? 0) > 0 ? "var(--color-negative)" : undefined }}
          title="Red cards"
        >
          {fmt_int(e.red_cards)}
        </span>
      );
    case "key_passes":
      return (
        <span className="mono" style={base_style} title="Key passes (passes leading to a shot)">
          {fmt_int(e.key_passes)}
        </span>
      );
    case "passes":
      return (
        <span className="mono" style={base_style} title="Total passes">
          {fmt_int(e.passes_total)}
        </span>
      );
    case "passes_accuracy":
      return (
        <span className="mono" style={base_style} title="Pass accuracy">
          {e.passes_accuracy != null ? `${e.passes_accuracy.toFixed(0)}%` : "—"}
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

// ---------------------------------------------------------------------------
// Mobile-only presentation: a compact sort control + a vertical list of
// player cards. Mirrors the native Screener (apps/mobile/.../screener.tsx);
// the desktop grid table above is untouched.
// ---------------------------------------------------------------------------

function MobileSortControl({
  options,
  sort_key,
  sort_dir,
  on_change_key,
  on_toggle_dir,
}: {
  options: { key: SortKey; label: string }[];
  sort_key: SortKey;
  sort_dir: SortDir;
  on_change_key: (k: SortKey) => void;
  on_toggle_dir: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.4)", letterSpacing: 0.4, textTransform: "uppercase", flexShrink: 0 }}>
        Sort
      </span>
      <select
        value={sort_key}
        onChange={e => on_change_key(e.target.value as SortKey)}
        style={{
          flex: 1,
          minWidth: 0,
          background: "rgba(255,255,255,.04)",
          border: "1px solid rgba(255,255,255,.08)",
          borderRadius: 9,
          color: "#fff",
          fontSize: 13,
          fontWeight: 600,
          fontFamily: "inherit",
          padding: "8px 10px",
          cursor: "pointer",
        }}
      >
        {options.map(o => (
          <option key={o.key} value={o.key} style={{ background: "#0a0d12" }}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        onClick={on_toggle_dir}
        aria-label={sort_dir === "asc" ? "Ascending" : "Descending"}
        style={{
          flexShrink: 0,
          width: 38,
          height: 36,
          background: "rgba(255,255,255,.04)",
          border: "1px solid rgba(255,255,255,.08)",
          borderRadius: 9,
          color: "#fff",
          fontSize: 14,
          fontWeight: 800,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {sort_dir === "asc" ? "↑" : "↓"}
      </button>
    </div>
  );
}

interface MobileStatCell {
  label: string;
  value: string;
  color?: string;
  // Yellow/red card counts rendered as two colour-coded numbers.
  cards?: { y: number | null; r: number | null };
}

// Per-tab stat strip for the mobile card — port of the native `stat_cells`.
function mobile_stat_cells(e: ScreenerEntry, tab: Tab): MobileStatCell[] {
  const num = (v: number | null) => (v == null ? "—" : `${v}`);
  if (tab === "valuation") {
    return [
      { label: "All-time", value: fmt_pct(e.since_start_pct), color: pct_color(e.since_start_pct) },
      { label: "Last match", value: fmt_pct(e.last_match_pct), color: pct_color(e.last_match_pct) },
      { label: "Avg / match", value: fmt_pct(e.avg_match_pct), color: pct_color(e.avg_match_pct) },
    ];
  }
  if (tab === "statistics") {
    return [
      { label: "Rating", value: e.rating_avg == null ? "—" : e.rating_avg.toFixed(1) },
      { label: "Apps", value: num(e.appearances) },
      { label: "Min", value: num(e.minutes_played) },
      { label: "Goals", value: num(e.goals) },
      { label: "Assists", value: num(e.assists) },
      { label: "Cards", value: "", cards: { y: e.yellow_cards, r: e.red_cards } },
    ];
  }
  return [
    { label: "Age", value: num(e.age) },
    { label: "Foot", value: e.foot ? e.foot[0].toUpperCase() + e.foot.slice(1) : "—" },
    { label: "Height", value: e.height == null ? "—" : `${e.height} cm` },
    { label: "Weight", value: e.weight == null ? "—" : `${e.weight} kg` },
  ];
}

function MobileCard({
  entry: e,
  tab,
  team_color,
  team_flag,
  team_flag_url,
  team_name,
  watched,
  held,
  on_open,
  on_open_team,
  on_toggle_watch,
}: {
  entry: ScreenerEntry;
  tab: Tab;
  team_color: string;
  team_flag?: string;
  team_flag_url?: string;
  team_name?: string;
  watched: boolean;
  held: boolean;
  on_open: () => void;
  on_open_team?: (team_id: string) => void;
  on_toggle_watch: () => void;
}) {
  const cells = mobile_stat_cells(e, tab);
  const meta = [team_name, e.club].filter(Boolean).join(" · ");
  const label_style: React.CSSProperties = {
    fontSize: 9,
    fontWeight: 600,
    color: "rgba(255,255,255,.4)",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  };
  const value_style: React.CSSProperties = {
    fontSize: 12.5,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
  return (
    <div
      onClick={on_open}
      style={{
        position: "relative",
        background: "rgba(255,255,255,.045)",
        border: "1px solid rgba(255,255,255,.09)",
        borderRadius: 12,
        padding: "10px 12px",
        cursor: "pointer",
      }}
    >
      <span
        onClick={ev => {
          ev.stopPropagation();
          on_toggle_watch();
        }}
        style={{
          position: "absolute",
          top: 4,
          left: 6,
          zIndex: 2,
          fontSize: 14,
          lineHeight: 1,
          color: watched ? "#fff" : "rgba(255,255,255,.2)",
          cursor: "pointer",
        }}
      >
        {watched ? "★" : "☆"}
      </span>

      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <PlayerAvatar
          image_path={e.image_path}
          jersey_number={e.jersey_number}
          team_color={team_color}
          size={46}
          radius={9}
          fit="contain"
          alt={e.full_name ?? e.name}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.45)", flexShrink: 0 }}>
              {e.jersey_number}
            </span>
            <span style={{ fontSize: 15, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
              {e.name}
            </span>
            {held && (
              <span
                title="In your portfolio"
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: 0.4,
                  color: "var(--color-positive)",
                  background: "color-mix(in srgb, var(--color-positive) 14%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--color-positive) 35%, transparent)",
                  padding: "1px 5px",
                  borderRadius: 3,
                  flexShrink: 0,
                }}
              >
                HELD
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, minWidth: 0 }}>
            <TeamLink
              team_id={e.team_id}
              on_open_team={on_open_team}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(255,255,255,.55)", minWidth: 0, overflow: "hidden" }}
            >
              {team_flag_url ? (
                <img src={team_flag_url} alt={team_name ?? ""} style={{ width: 15, height: 15, objectFit: "contain", flexShrink: 0 }} />
              ) : (
                <span style={{ fontSize: 12 }}>{team_flag}</span>
              )}
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{meta}</span>
            </TeamLink>
            <PositionBadge position={e.position as Position} />
          </div>
        </div>
        <PriceCell value={e.current_price} />
      </div>

      <div style={{ display: "flex", marginTop: 9, paddingTop: 9, borderTop: "1px solid rgba(255,255,255,.07)" }}>
        {cells.map(c => (
          <div key={c.label} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
            <span style={label_style}>{c.label}</span>
            {c.cards ? (
              c.cards.y == null && c.cards.r == null ? (
                <span className="mono" style={{ ...value_style, color: "rgba(255,255,255,.82)" }}>—</span>
              ) : (
                <span className="mono" style={value_style}>
                  <span style={{ color: color.cardYellow }}>{c.cards.y ?? 0}</span>
                  <span style={{ color: "rgba(255,255,255,.3)" }}> · </span>
                  <span style={{ color: "var(--color-negative)" }}>{c.cards.r ?? 0}</span>
                </span>
              )
            ) : (
              <span className="mono" style={{ ...value_style, color: c.color ?? "rgba(255,255,255,.82)" }}>
                {c.value}
              </span>
            )}
          </div>
        ))}
        {tab === "valuation" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={label_style}>Trend</span>
            <Spark data={spark_for_player(e.id)} width={60} height={16} />
          </div>
        )}
      </div>
    </div>
  );
}
