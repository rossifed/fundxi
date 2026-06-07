// Screener — RN port of apps/web/src/ui/pages/screener/ScreenerPage.tsx.
//
// Mobile-first redesign ("Screener — version mobile recommandée"): the wide web
// grid becomes a vertical FlatList of COMPACT horizontal player rows (star +
// avatar + identity + value/perf/spark) so 6+ players are scannable without
// scrolling. Per-tab stats are no longer boxed into every card; filtering lives
// in a bottom sheet, with the active filters surfaced as removable chips on the
// main screen. Same dataset, same tabs, same live price sync — "web adapted to
// native" per CLAUDE.md (single column, full-width, no parity break).

import { useMemo, useRef, useState } from "react";
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Svg, { Circle, Line } from "react-native-svg";
import MultiSlider from "@ptomasroos/react-native-multi-slider";

import { players_api } from "@fundxi/core/api/players_api";
import { portfolio_api } from "@fundxi/core/api/portfolio_api";
import { teams_api } from "@fundxi/core/api/teams_api";
import type { Position } from "@fundxi/core/domain/player/player";
import { POSITION_LABEL } from "@fundxi/core/domain/player/player";
import {
  refresh_screener_repository,
  screener_repository,
  type ScreenerEntry,
} from "@fundxi/core/infrastructure/repositories/screener_repository";
import { spark_for_player } from "@fundxi/core/infrastructure/repositories/valuations_repository";

import { Spark } from "@/components/Spark";
import { PositionBadge } from "@/components/PositionBadge";
import { TickValue } from "@/components/TickValue";
import { PlayerSheet, type PlayerSheetHandle } from "@/components/PlayerSheet";
import { useLiveRefetch, usePricesLiveVersion } from "@/components/live";
import { useRefresh } from "@/components/use_refresh";
import { color_for_sign, fmt_signed_pct } from "@/lib/format";
import { toggle_set } from "@/lib/state";
import { useWatchlist, watchlist } from "@/lib/watchlist";
import { mono, palette, position_color, text } from "@/theme/tokens";

type Tab = "valuation" | "statistics" | "personal";
type SortDir = "asc" | "desc";
type SortKey =
  | "name" | "value" | "since_start" | "last_match" | "avg_match"
  | "appearances" | "minutes_played" | "goals" | "assists" | "shots"
  | "yellow_cards" | "red_cards" | "key_passes" | "passes" | "passes_accuracy"
  | "rating_avg" | "age" | "height" | "weight";

type Range = [number, number];

interface SortOpt {
  key: SortKey;
  label: string;
}

// Sort options per tab (replaces the web's clickable column headers). The card
// stays compact; tabs change the available sort keys + the small inline stat
// line shown on the Statistics / Personal tabs.
const TAB_SORTS: Record<Tab, SortOpt[]> = {
  valuation: [
    { key: "value", label: "Value" },
    { key: "since_start", label: "All-time %" },
    { key: "last_match", label: "Last match %" },
    { key: "avg_match", label: "Avg / match %" },
    { key: "name", label: "Name" },
  ],
  statistics: [
    { key: "value", label: "Value" },
    { key: "appearances", label: "Apps" },
    { key: "goals", label: "Goals" },
    { key: "assists", label: "Assists" },
    { key: "rating_avg", label: "Rating" },
    { key: "name", label: "Name" },
  ],
  personal: [
    { key: "value", label: "Value" },
    { key: "age", label: "Age" },
    { key: "height", label: "Height" },
    { key: "name", label: "Name" },
  ],
};

const PRICE_STEP = 5;
const PERF_STEP = 5;
const PERF_PRESETS: Range[] = [
  [-20, 0],
  [0, 10],
  [10, 30],
  [30, 999],
];

const clamp_range = (r: Range, bounds: Range): Range => [
  Math.max(r[0], bounds[0]),
  Math.min(r[1], bounds[1]),
];
const range_eq = (a: Range | null, b: Range): boolean => a != null && a[0] === b[0] && a[1] === b[1];

export default function ScreenerScreen() {
  const sheet_ref = useRef<PlayerSheetHandle>(null);

  const [position_filters, set_position_filters] = useState<Set<Position>>(new Set());
  const [team_filters, set_team_filters] = useState<Set<string>>(new Set());
  // `null` ⇒ filter inactive (full range). Sliders read the computed bounds.
  const [price_range, set_price_range] = useState<Range | null>(null);
  const [perf_range, set_perf_range] = useState<Range | null>(null);
  const [age_range, set_age_range] = useState<Range | null>(null);
  const [held_only, set_held_only] = useState(false);
  const [watch_only, set_watch_only] = useState(false);
  const [search, set_search] = useState("");
  const [show_filters, set_show_filters] = useState(false);
  const [show_sort, set_show_sort] = useState(false);
  const [tab, set_tab] = useState<Tab>("valuation");
  const [sort_key, set_sort_key] = useState<SortKey>("value");
  const [sort_dir, set_sort_dir] = useState<SortDir>("desc");
  // Shared session store so the watchlist survives tab navigation and is
  // readable from Home (the RN parity for the web RightRail watchlist).
  const watched_ids = useWatchlist();

  const [data_version, set_data_version] = useState(0);
  useLiveRefetch(usePricesLiveVersion(), () => {
    void refresh_screener_repository().then(() => set_data_version(v => v + 1));
  });
  const { refreshing, onRefresh } = useRefresh(() =>
    refresh_screener_repository().then(() => set_data_version(v => v + 1)),
  );

  const all_entries = useMemo(() => screener_repository.find_all(), [data_version]);
  const sorted_team_ids = useMemo(() => {
    const ids = Array.from(new Set(all_entries.map(e => e.team_id)));
    return ids.sort((a, b) => (teams_api.get(a)?.name ?? a).localeCompare(teams_api.get(b)?.name ?? b));
  }, [all_entries]);
  const held_ids = useMemo(() => new Set(portfolio_api.get_holdings().map(h => h.player_id)), []);

  // Slider bounds derived from the live dataset — never hardcoded ranges.
  const price_max = useMemo(() => {
    const m = all_entries.reduce((a, e) => Math.max(a, e.current_price), 0);
    return Math.max(PRICE_STEP, Math.ceil(m / PRICE_STEP) * PRICE_STEP);
  }, [all_entries]);
  const perf_bounds = useMemo<Range>(() => bounds_of(all_entries, e => e.since_start_pct, PERF_STEP, [-50, 100]), [all_entries]);
  const age_bounds = useMemo<Range>(() => bounds_of(all_entries, e => e.age, 1, [16, 45]), [all_entries]);
  const price_bounds: Range = [0, price_max];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = all_entries.filter(e => {
      if (position_filters.size > 0 && !position_filters.has(e.position as Position)) return false;
      if (team_filters.size > 0 && !team_filters.has(e.team_id)) return false;
      if (price_range && (e.current_price < price_range[0] || e.current_price > price_range[1])) return false;
      if (perf_range) {
        const v = e.since_start_pct;
        if (v == null || v < perf_range[0] || v > perf_range[1]) return false;
      }
      if (age_range) {
        const v = e.age;
        if (v == null || v < age_range[0] || v > age_range[1]) return false;
      }
      if (held_only && !held_ids.has(e.id)) return false;
      if (watch_only && !watched_ids.has(e.id)) return false;
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
  }, [all_entries, position_filters, team_filters, price_range, perf_range, age_range, held_only, watch_only, watched_ids, search, sort_key, sort_dir, held_ids]);

  const active_count =
    position_filters.size +
    team_filters.size +
    (price_range ? 1 : 0) +
    (perf_range ? 1 : 0) +
    (age_range ? 1 : 0) +
    (held_only ? 1 : 0) +
    (watch_only ? 1 : 0);
  const has_filters = active_count > 0;

  const reset_all = () => {
    set_position_filters(new Set());
    set_team_filters(new Set());
    set_price_range(null);
    set_perf_range(null);
    set_age_range(null);
    set_held_only(false);
    set_watch_only(false);
  };

  const open_player = (id: number) => {
    const p = players_api.get(id);
    if (p) sheet_ref.current?.open(p);
  };

  const sort_options = TAB_SORTS[tab];
  const sort_label = sort_options.find(o => o.key === sort_key)?.label ?? "Value";

  const select_sort = (key: SortKey) => {
    if (key === sort_key) set_sort_dir(d => (d === "asc" ? "desc" : "asc"));
    else {
      set_sort_key(key);
      set_sort_dir("desc");
    }
  };

  // Removable chips for every active filter — flags only for country chips.
  const active_chips: { key: string; label: string; flag?: string; flag_url?: string; clear: () => void }[] = [
    ...Array.from(position_filters).map(p => ({
      key: `pos:${p}`,
      label: POSITION_LABEL[p],
      clear: () => toggle_set(position_filters, set_position_filters, p),
    })),
    ...(price_range
      ? [{ key: "price", label: fmt_price_range(price_range, price_max), clear: () => set_price_range(null) }]
      : []),
    ...(perf_range
      ? [{ key: "perf", label: fmt_perf_range(perf_range), clear: () => set_perf_range(null) }]
      : []),
    ...(age_range ? [{ key: "age", label: `${age_range[0]}–${age_range[1]} yrs`, clear: () => set_age_range(null) }] : []),
    ...Array.from(team_filters).map(id => {
      const team = teams_api.get(id);
      return {
        key: `team:${id}`,
        label: team?.name ?? id,
        flag: team?.flag,
        flag_url: team?.flag_url,
        clear: () => toggle_set(team_filters, set_team_filters, id),
      };
    }),
    ...(held_only ? [{ key: "held", label: "In portfolio", clear: () => set_held_only(false) }] : []),
    ...(watch_only ? [{ key: "watch", label: "★ Watchlist", clear: () => set_watch_only(false) }] : []),
  ];

  const header = (
    <View style={styles.header_block}>
      {/* Filters trigger + search */}
      <View style={styles.search_row}>
        <Pressable
          onPress={() => set_show_filters(true)}
          style={[styles.filter_btn, has_filters && styles.filter_btn_on]}
        >
          <FilterIcon color={has_filters ? "#fff" : text.secondary} />
          <Text style={[styles.filter_btn_label, has_filters && styles.filter_btn_label_on]}>Filters</Text>
          {active_count > 0 && (
            <View style={styles.filter_count}>
              <Text style={styles.filter_count_text}>{active_count}</Text>
            </View>
          )}
        </Pressable>
        <View style={styles.search_box}>
          <Text style={styles.search_icon}>🔍</Text>
          <TextInput
            value={search}
            onChangeText={set_search}
            placeholder="Search players, teams, clubs..."
            placeholderTextColor={text.muted}
            style={styles.search_input}
          />
          {search.length > 0 && (
            <Pressable onPress={() => set_search("")} hitSlop={8}>
              <Text style={styles.search_clear}>✕</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Tabs — compact, active = FundXI blue */}
      <View style={styles.tabs}>
        {(["valuation", "statistics", "personal"] as Tab[]).map(t => {
          const on = tab === t;
          return (
            <Pressable key={t} onPress={() => set_tab(t)} style={[styles.tab, on && styles.tab_on]}>
              <Text style={[styles.tab_label, on && styles.tab_label_on]}>{t}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Compact sort line with the result count integrated on the right */}
      <View style={styles.sort_count_row}>
        <Pressable style={styles.sort_pill} onPress={() => set_show_sort(true)}>
          <Text style={styles.sort_pill_label}>
            Sort: <Text style={styles.sort_pill_value}>{sort_label}</Text>
          </Text>
          <Text style={styles.sort_pill_icon}>{sort_dir === "asc" ? "↑" : "↓"}</Text>
        </Pressable>
        <Text style={styles.count}>{filtered.length} players</Text>
      </View>

      {/* Active filter chips + Clear all */}
      {active_chips.length > 0 && (
        <View style={styles.chips_line}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips_scroll}
            style={styles.chips_flex}
          >
            {active_chips.map(c => (
              <Pressable key={c.key} onPress={c.clear} style={styles.active_chip}>
                {c.flag_url ? (
                  <Image source={{ uri: c.flag_url }} style={styles.active_flag_img} resizeMode="contain" />
                ) : c.flag ? (
                  <Text style={styles.active_flag}>{c.flag}</Text>
                ) : null}
                <Text style={styles.active_chip_label}>{c.label}</Text>
                <Text style={styles.active_chip_x}>✕</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable onPress={reset_all} hitSlop={6} style={styles.clear_all}>
            <Text style={styles.clear_all_label}>Clear all</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        data={filtered}
        keyExtractor={e => String(e.id)}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list_content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        windowSize={10}
        initialNumToRender={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        renderItem={({ item }) => (
          <ScreenerRow
            entry={item}
            tab={tab}
            watched={watched_ids.has(item.id)}
            held={held_ids.has(item.id)}
            on_open={() => open_player(item.id)}
            on_toggle_watch={() => watchlist.toggle(item.id)}
          />
        )}
        ListEmptyComponent={<Text style={styles.empty}>No players match your filters</Text>}
      />

      <SortMenu
        visible={show_sort}
        options={sort_options}
        sort_key={sort_key}
        sort_dir={sort_dir}
        on_select={select_sort}
        on_close={() => set_show_sort(false)}
      />

      <FiltersSheet
        visible={show_filters}
        on_close={() => set_show_filters(false)}
        result_count={filtered.length}
        active_count={active_count}
        has_filters={has_filters}
        on_reset={reset_all}
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

      <PlayerSheet ref={sheet_ref} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Filter (sliders) icon — drawn with react-native-svg, matching the app's
// icon convention (no icon font dependency; see components/KpiIcon.tsx).
// ---------------------------------------------------------------------------

function FilterIcon({ color, size = 15 }: { color: string; size?: number }) {
  const knob = { fill: palette.surfaceDeep, stroke: color, strokeWidth: 2 };
  const rail = { stroke: color, strokeWidth: 2, strokeLinecap: "round" as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1={3} y1={6} x2={21} y2={6} {...rail} />
      <Circle cx={16} cy={6} r={2.7} {...knob} />
      <Line x1={3} y1={12} x2={21} y2={12} {...rail} />
      <Circle cx={9} cy={12} r={2.7} {...knob} />
      <Line x1={3} y1={18} x2={21} y2={18} {...rail} />
      <Circle cx={15} cy={18} r={2.7} {...knob} />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Player row — compact horizontal card
// ---------------------------------------------------------------------------

function ScreenerRow({
  entry: e,
  tab,
  watched,
  held,
  on_open,
  on_toggle_watch,
}: {
  entry: ScreenerEntry;
  tab: Tab;
  watched: boolean;
  held: boolean;
  on_open: () => void;
  on_toggle_watch: () => void;
}) {
  const team = teams_api.get(e.team_id);
  const perf = e.since_start_pct;
  const perf_color = color_for_sign(perf);
  const meta = [team?.name, e.club].filter(Boolean).join(" · ");
  const spark = spark_for_player(e.id);
  const show_spark = tab === "valuation" && spark.length > 1;
  const stat_line = tab === "valuation" ? null : secondary_stat_line(e, tab);
  const team_color = team?.color ?? "#666";
  const has_photo = e.image_path != null && e.image_path !== "";

  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.row_pressed]} onPress={on_open} accessibilityRole="button">
      <Pressable onPress={on_toggle_watch} hitSlop={8} style={styles.star_hit}>
        <Text style={[styles.star, watched && styles.star_on]}>{watched ? "★" : "☆"}</Text>
      </Pressable>

      {/* Mini squad-card thumbnail — bottom-anchored portrait on a team-kit
          tint, with the jersey number on a legible chip (corner over the
          photo, or centred when there is no photo). team_color is per-row
          provider data (allowed inline per CLAUDE.md). */}
      <View style={[styles.hero, { backgroundColor: tint(team_color, has_photo ? "22" : "33") }]}>
        {has_photo ? (
          <>
            <Image source={{ uri: e.image_path! }} style={styles.hero_photo} resizeMode="contain" />
            <View style={styles.hero_num_chip}>
              <Text style={styles.hero_num_chip_txt}>{e.jersey_number}</Text>
            </View>
          </>
        ) : (
          <Text style={styles.hero_num_big} numberOfLines={1}>{e.jersey_number}</Text>
        )}
      </View>

      <View style={styles.identity}>
        <View style={styles.name_row}>
          <Text style={styles.name} numberOfLines={1}>{e.name}</Text>
          {held && (
            <View style={styles.held}>
              <Text style={styles.held_label}>HELD</Text>
            </View>
          )}
        </View>
        <View style={styles.meta_row}>
          {team?.flag_url ? (
            <Image source={{ uri: team.flag_url }} style={styles.meta_flag_img} resizeMode="contain" />
          ) : (
            <Text style={styles.meta_flag}>{team?.flag}</Text>
          )}
          <Text style={styles.meta_text} numberOfLines={1}>{meta}</Text>
          <PositionBadge position={e.position as Position} abbr />
        </View>
        {stat_line ? <Text style={styles.stat_line} numberOfLines={1}>{stat_line}</Text> : null}
      </View>

      <View style={styles.price_col}>
        {show_spark && (
          <Spark data={spark} width={70} height={26} color={perf == null ? undefined : perf_color} />
        )}
        <TickValue value={e.current_price}>
          <Text style={styles.price}>€{e.current_price.toFixed(1)}M</Text>
        </TickValue>
        <Text style={[styles.price_pct, { color: perf_color }]}>{fmt_signed_pct(perf, 1)}</Text>
      </View>
    </Pressable>
  );
}

// Team kit colour → translucent tint. team_color is per-row provider data
// (allowed inline per CLAUDE.md); guard non-hex values to a neutral overlay.
function tint(hex: string, alpha: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${alpha}` : "rgba(255,255,255,0.06)";
}

// Single compact stat line for the Statistics / Personal tabs (replaces the
// boxed ALL-TIME/LAST/AVG strip). Returns null when there is nothing real to
// show, so we never render a row of zeros or an empty line.
function secondary_stat_line(e: ScreenerEntry, tab: Tab): string | null {
  const parts: string[] = [];
  if (tab === "statistics") {
    if (e.appearances != null) parts.push(`${e.appearances} apps`);
    if (e.goals != null) parts.push(`${e.goals} G`);
    if (e.assists != null) parts.push(`${e.assists} A`);
    // Match stats are empty until live ingest runs (no fabricated zeros) — show
    // a compact honest placeholder so the tab doesn't read as broken.
    return parts.length > 0 ? parts.join("  ·  ") : "No match stats yet";
  }
  if (e.age != null) parts.push(`${e.age}y`);
  if (e.height != null) parts.push(`${e.height}cm`);
  if (e.foot) parts.push(`${e.foot} foot`);
  return parts.length > 0 ? parts.join("  ·  ") : null;
}

// ---------------------------------------------------------------------------
// Sort menu (compact dropdown)
// ---------------------------------------------------------------------------

function SortMenu({
  visible,
  options,
  sort_key,
  sort_dir,
  on_select,
  on_close,
}: {
  visible: boolean;
  options: SortOpt[];
  sort_key: SortKey;
  sort_dir: SortDir;
  on_select: (key: SortKey) => void;
  on_close: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={on_close}>
      <Pressable style={styles.menu_backdrop} onPress={on_close}>
        <Pressable style={styles.menu} onPress={() => {}}>
          <Text style={styles.menu_title}>Sort by</Text>
          {options.map(o => {
            const on = o.key === sort_key;
            return (
              <Pressable key={o.key} style={[styles.menu_item, on && styles.menu_item_on]} onPress={() => on_select(o.key)}>
                <Text style={[styles.menu_item_label, on && styles.menu_item_label_on]}>{o.label}</Text>
                {on && <Text style={styles.menu_item_dir}>{sort_dir === "asc" ? "▲ Asc" : "▼ Desc"}</Text>}
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Range slider (dual-thumb) — measures its own width for MultiSlider.
// ---------------------------------------------------------------------------

function RangeSlider({
  bounds,
  value,
  step,
  format,
  on_change,
}: {
  bounds: Range;
  value: Range;
  step: number;
  format: (v: number) => string;
  on_change: (r: Range) => void;
}) {
  const [width, set_width] = useState(0);
  return (
    <View style={styles.slider_block}>
      <View style={styles.slider_value_row}>
        <Text style={styles.slider_value}>{format(value[0])}</Text>
        <Text style={styles.slider_value}>{format(value[1])}</Text>
      </View>
      <View style={styles.slider_track} onLayout={ev => set_width(ev.nativeEvent.layout.width)}>
        {width > 0 && (
          <MultiSlider
            values={value}
            min={bounds[0]}
            max={bounds[1]}
            step={step}
            sliderLength={width}
            onValuesChange={v => on_change([v[0], v[1]])}
            allowOverlap={false}
            snapped
            minMarkerOverlapDistance={6}
            selectedStyle={{ backgroundColor: palette.accentBlue }}
            unselectedStyle={{ backgroundColor: "rgba(255,255,255,0.14)" }}
            trackStyle={styles.slider_rail}
            markerStyle={styles.slider_marker}
            pressedMarkerStyle={styles.slider_marker_pressed}
            containerStyle={styles.slider_container}
          />
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Filters bottom sheet
// ---------------------------------------------------------------------------

interface ActiveChip {
  key: string;
  label: string;
  flag?: string;
  flag_url?: string;
  clear: () => void;
}

const COUNTRY_LIMIT = 8;

function FiltersSheet({
  visible,
  on_close,
  result_count,
  active_count,
  has_filters,
  on_reset,
  active_chips,
  position_filters,
  set_position_filters,
  price_bounds,
  price_max,
  price_range,
  set_price_range,
  perf_bounds,
  perf_range,
  set_perf_range,
  age_bounds,
  age_range,
  set_age_range,
  team_filters,
  set_team_filters,
  sorted_team_ids,
  held_only,
  set_held_only,
  watch_only,
  set_watch_only,
}: {
  visible: boolean;
  on_close: () => void;
  result_count: number;
  active_count: number;
  has_filters: boolean;
  on_reset: () => void;
  active_chips: ActiveChip[];
  position_filters: Set<Position>;
  set_position_filters: React.Dispatch<React.SetStateAction<Set<Position>>>;
  price_bounds: Range;
  price_max: number;
  price_range: Range | null;
  set_price_range: (r: Range | null) => void;
  perf_bounds: Range;
  perf_range: Range | null;
  set_perf_range: (r: Range | null) => void;
  age_bounds: Range;
  age_range: Range | null;
  set_age_range: (r: Range | null) => void;
  team_filters: Set<string>;
  set_team_filters: React.Dispatch<React.SetStateAction<Set<string>>>;
  sorted_team_ids: string[];
  held_only: boolean;
  set_held_only: (v: boolean) => void;
  watch_only: boolean;
  set_watch_only: (v: boolean) => void;
}) {
  const [country_q, set_country_q] = useState("");
  const [show_all_countries, set_show_all_countries] = useState(false);
  const [other_open, set_other_open] = useState(false);

  const price_presets: Range[] = ([[0, 30], [30, 60], [60, 100], [100, price_max]] as Range[]).filter(
    ([lo]) => lo < price_max,
  );

  const on_price = (r: Range) => set_price_range(r[0] <= price_bounds[0] && r[1] >= price_bounds[1] ? null : r);
  const on_perf = (r: Range) => set_perf_range(r[0] <= perf_bounds[0] && r[1] >= perf_bounds[1] ? null : r);
  const on_age = (r: Range) => set_age_range(r[0] <= age_bounds[0] && r[1] >= age_bounds[1] ? null : r);

  const toggle_price = (preset: Range) => {
    const c = clamp_range(preset, price_bounds);
    set_price_range(range_eq(price_range, c) ? null : c);
  };
  const toggle_perf = (preset: Range) => {
    const c = clamp_range(preset, perf_bounds);
    set_perf_range(range_eq(perf_range, c) ? null : c);
  };

  const searching = country_q.trim() !== "";
  const all_countries = sorted_team_ids
    .map(id => ({ id, team: teams_api.get(id) }))
    .filter((c): c is { id: string; team: NonNullable<typeof c.team> } => c.team != null)
    .filter(({ team }) => !searching || team.name.toLowerCase().includes(country_q.trim().toLowerCase()));
  const countries = searching || show_all_countries ? all_countries : all_countries.slice(0, COUNTRY_LIMIT);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={on_close}>
      <Pressable style={styles.sheet_backdrop} onPress={on_close}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.sheet_handle} />

          <View style={styles.sheet_head}>
            <Text style={styles.sheet_title}>Filters</Text>
            <Pressable disabled={!has_filters} onPress={on_reset} hitSlop={8}>
              <Text style={[styles.reset, !has_filters && styles.reset_off]}>
                Reset all{has_filters ? ` (${active_count})` : ""}
              </Text>
            </Pressable>
          </View>

          {active_chips.length > 0 && (
            <View style={styles.chip_wrap}>
              {active_chips.map(c => (
                <Pressable key={c.key} onPress={c.clear} style={styles.active_chip}>
                  {c.flag_url ? (
                    <Image source={{ uri: c.flag_url }} style={styles.active_flag_img} resizeMode="contain" />
                  ) : c.flag ? (
                    <Text style={styles.active_flag}>{c.flag}</Text>
                  ) : null}
                  <Text style={styles.active_chip_label}>{c.label}</Text>
                  <Text style={styles.active_chip_x}>✕</Text>
                </Pressable>
              ))}
            </View>
          )}

          <ScrollView
            style={styles.sheet_scroll}
            contentContainerStyle={styles.sheet_scroll_content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <FilterLabel>Position</FilterLabel>
            <View style={styles.chip_wrap}>
              <Pressable
                onPress={() => set_position_filters(new Set())}
                style={[styles.chip, position_filters.size === 0 && styles.chip_on]}
              >
                <Text style={[styles.chip_label, position_filters.size === 0 && styles.chip_label_on]}>All</Text>
              </Pressable>
              {(["FW", "MF", "DF", "GK"] as Position[]).map(p => {
                const on = position_filters.has(p);
                return (
                  <Pressable
                    key={p}
                    onPress={() => toggle_set(position_filters, set_position_filters, p)}
                    style={[styles.chip, on && styles.chip_on]}
                  >
                    <View style={[styles.pos_dot, { backgroundColor: position_color[p], opacity: on ? 1 : 0.4 }]} />
                    <Text style={[styles.chip_label, on && styles.chip_label_on]}>{p}</Text>
                  </Pressable>
                );
              })}
            </View>

            <FilterLabel>Price range</FilterLabel>
            <View style={styles.chip_wrap}>
              {price_presets.map(preset => {
                const c = clamp_range(preset, price_bounds);
                const on = range_eq(price_range, c);
                return (
                  <Pressable key={preset[0]} onPress={() => toggle_price(preset)} style={[styles.chip, on && styles.chip_on]}>
                    <Text style={[styles.chip_label, on && styles.chip_label_on]}>{fmt_price_range(preset, price_max)}</Text>
                  </Pressable>
                );
              })}
            </View>
            <RangeSlider
              bounds={price_bounds}
              value={price_range ?? price_bounds}
              step={PRICE_STEP}
              format={v => `€${v}M`}
              on_change={on_price}
            />

            {/* Performance = real tournament-to-date return (since_start_pct),
                the same figure the All-time column shows. No synthetic window. */}
            <FilterLabel>Performance</FilterLabel>
            <View style={styles.chip_wrap}>
              {PERF_PRESETS.map(preset => {
                const c = clamp_range(preset, perf_bounds);
                const on = range_eq(perf_range, c);
                return (
                  <Pressable key={preset[0]} onPress={() => toggle_perf(preset)} style={[styles.chip, on && styles.chip_on]}>
                    <Text style={[styles.chip_label, on && styles.chip_label_on]}>{fmt_perf_range(preset)}</Text>
                  </Pressable>
                );
              })}
            </View>
            <RangeSlider
              bounds={perf_bounds}
              value={perf_range ?? perf_bounds}
              step={PERF_STEP}
              format={v => `${v >= 0 ? "+" : ""}${v}%`}
              on_change={on_perf}
            />

            <FilterLabel>Countries</FilterLabel>
            <View style={styles.country_search}>
              <Text style={styles.search_icon}>🔍</Text>
              <TextInput
                value={country_q}
                onChangeText={set_country_q}
                placeholder="Search countries..."
                placeholderTextColor={text.muted}
                style={styles.search_input}
              />
              {country_q.length > 0 && (
                <Pressable onPress={() => set_country_q("")} hitSlop={8}>
                  <Text style={styles.search_clear}>✕</Text>
                </Pressable>
              )}
            </View>
            <View style={styles.country_grid}>
              {countries.map(({ id, team }) => {
                const on = team_filters.has(id);
                return (
                  <Pressable
                    key={id}
                    onPress={() => toggle_set(team_filters, set_team_filters, id)}
                    style={[styles.country_item, on && styles.country_item_on]}
                  >
                    <View style={[styles.checkbox, on && styles.checkbox_on]}>
                      {on && <Text style={styles.checkbox_tick}>✓</Text>}
                    </View>
                    {team.flag_url ? (
                      <Image source={{ uri: team.flag_url }} style={styles.country_flag_img} resizeMode="contain" />
                    ) : (
                      <Text style={styles.country_flag}>{team.flag}</Text>
                    )}
                    <Text style={[styles.country_name, on && styles.country_name_on]} numberOfLines={1}>
                      {team.name}
                    </Text>
                  </Pressable>
                );
              })}
              {countries.length === 0 && <Text style={styles.country_empty}>No country matches</Text>}
            </View>
            {!searching && all_countries.length > COUNTRY_LIMIT && (
              <Pressable onPress={() => set_show_all_countries(s => !s)} hitSlop={6} style={styles.show_more}>
                <Text style={styles.show_more_label}>
                  {show_all_countries ? "Show less" : `Show all ${all_countries.length}`}
                </Text>
              </Pressable>
            )}

            {/* Other filters — collapsible. Only data-backed controls are wired
                (Age + portfolio/watchlist). Market trend / availability / risk
                have no provider field, so they are not faked here. */}
            <Pressable style={styles.collapse_head} onPress={() => set_other_open(o => !o)}>
              <FilterLabel>Other filters</FilterLabel>
              <Text style={styles.collapse_caret}>{other_open ? "▾" : "▸"}</Text>
            </Pressable>
            {other_open && (
              <View style={styles.collapse_body}>
                <Text style={styles.sub_label}>Age</Text>
                <RangeSlider
                  bounds={age_bounds}
                  value={age_range ?? age_bounds}
                  step={1}
                  format={v => `${v}`}
                  on_change={on_age}
                />
                <View style={styles.chip_wrap}>
                  <Pressable onPress={() => set_held_only(!held_only)} style={[styles.chip, held_only && styles.chip_on]}>
                    <Text style={[styles.chip_label, held_only && styles.chip_label_on]}>In portfolio</Text>
                  </Pressable>
                  <Pressable onPress={() => set_watch_only(!watch_only)} style={[styles.chip, watch_only && styles.chip_on]}>
                    <Text style={[styles.chip_label, watch_only && styles.chip_label_on]}>★ Watchlist</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </ScrollView>

          <View style={styles.sheet_footer}>
            <Pressable
              disabled={!has_filters}
              onPress={on_reset}
              style={[styles.footer_reset, !has_filters && styles.footer_reset_off]}
            >
              <Text style={[styles.footer_reset_label, !has_filters && styles.reset_off]}>Reset</Text>
            </Pressable>
            <Pressable onPress={on_close} style={styles.footer_apply}>
              <Text style={styles.footer_apply_label}>Show {result_count} players</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.filter_label}>{children}</Text>;
}

// Generic bounds extractor for the sliders, snapped outward to `step`.
function bounds_of(
  entries: ScreenerEntry[],
  pick: (e: ScreenerEntry) => number | null,
  step: number,
  fallback: Range,
): Range {
  let lo = Infinity;
  let hi = -Infinity;
  for (const e of entries) {
    const v = pick(e);
    if (v == null) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (lo === Infinity) return fallback;
  const flo = Math.floor(lo / step) * step;
  const fhi = Math.ceil(hi / step) * step;
  return [flo, fhi > flo ? fhi : flo + step];
}

function fmt_price_range([lo, hi]: Range, price_max: number): string {
  return hi >= price_max ? `€${lo}M+` : `€${lo}M – €${hi}M`;
}
function fmt_perf_range([lo, hi]: Range): string {
  const s = (v: number) => `${v >= 0 ? "+" : ""}${v}%`;
  return hi >= 999 ? `${s(lo)}+` : `${s(lo)} – ${s(hi)}`;
}

// Sortable value extraction — mirrors the web `pluck`.
function pluck(e: ScreenerEntry, key: SortKey): number | string | null {
  switch (key) {
    case "name": return e.name;
    case "value": return e.current_price;
    case "since_start": return e.since_start_pct;
    case "last_match": return e.last_match_pct;
    case "avg_match": return e.avg_match_pct;
    case "appearances": return e.appearances;
    case "minutes_played": return e.minutes_played;
    case "goals": return e.goals;
    case "assists": return e.assists;
    case "shots": return e.shots_total;
    case "yellow_cards": return e.yellow_cards;
    case "red_cards": return e.red_cards;
    case "key_passes": return e.key_passes;
    case "passes": return e.passes_total;
    case "passes_accuracy": return e.passes_accuracy;
    case "rating_avg": return e.rating_avg;
    case "age": return e.age;
    case "height": return e.height;
    case "weight": return e.weight;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list_content: { paddingHorizontal: 16, paddingBottom: 32 },
  header_block: { paddingTop: 12, gap: 10 },

  search_row: { flexDirection: "row", gap: 8 },
  filter_btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 13,
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  filter_btn_on: { backgroundColor: palette.accentBlueSoft, borderColor: palette.accentBlue },
  filter_btn_label: { fontSize: 12, fontWeight: "700", color: text.secondary },
  filter_btn_label_on: { color: "#fff" },
  filter_count: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: palette.accentBlue,
    alignItems: "center",
    justifyContent: "center",
  },
  filter_count_text: { fontSize: 10, fontWeight: "800", color: "#fff" },
  search_box: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  search_icon: { fontSize: 14, color: text.muted },
  search_input: { flex: 1, color: "#fff", fontSize: 13, paddingVertical: 10 },
  search_clear: { fontSize: 13, color: text.muted, paddingHorizontal: 4 },

  filter_label: {
    fontSize: 10,
    fontWeight: "700",
    color: text.tertiary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 8,
    marginBottom: 2,
  },
  sub_label: { fontSize: 10, fontWeight: "700", color: text.muted, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 2 },
  chip_wrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  chip_on: { borderColor: palette.accentBlue, backgroundColor: palette.accentBlueSoft },
  chip_label: { fontSize: 12, fontWeight: "600", color: text.secondary },
  chip_label_on: { color: "#fff" },
  pos_dot: { width: 6, height: 6, borderRadius: 2 },

  tabs: { flexDirection: "row", gap: 6 },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  tab_on: { backgroundColor: palette.accentBlueSoft, borderColor: palette.accentBlue },
  tab_label: {
    fontSize: 11,
    fontWeight: "700",
    color: text.tertiary,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  tab_label_on: { color: "#fff" },

  sort_count_row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sort_pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  sort_pill_label: { fontSize: 12, fontWeight: "600", color: text.tertiary },
  sort_pill_value: { color: "#fff", fontWeight: "700" },
  sort_pill_icon: { fontSize: 12, color: palette.accentBlue, fontWeight: "800" },

  chips_line: { flexDirection: "row", alignItems: "center", gap: 8 },
  chips_flex: { flex: 1 },
  chips_scroll: { flexDirection: "row", alignItems: "center", gap: 6, paddingRight: 4 },
  active_chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingLeft: 9,
    paddingRight: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.accentBlue,
    backgroundColor: palette.accentBlueSoft,
  },
  active_flag: { fontSize: 12 },
  active_flag_img: { width: 15, height: 15, borderRadius: 2 },
  active_chip_label: { fontSize: 11, fontWeight: "700", color: "#fff" },
  active_chip_x: { fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: "700" },
  clear_all: { paddingHorizontal: 4, flexShrink: 0 },
  clear_all_label: { fontSize: 11, fontWeight: "700", color: palette.accentBlue },

  count: { fontSize: 12, color: text.tertiary, fontWeight: "600" },

  // --- Sort menu ---
  menu_backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", paddingHorizontal: 40 },
  menu: {
    backgroundColor: palette.surfaceDeep,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 14,
    padding: 8,
    gap: 2,
  },
  menu_title: {
    fontSize: 10,
    fontWeight: "700",
    color: text.tertiary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
  },
  menu_item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 9,
  },
  menu_item_on: { backgroundColor: palette.accentBlueSoft },
  menu_item_label: { fontSize: 14, fontWeight: "600", color: text.secondary },
  menu_item_label_on: { color: "#fff", fontWeight: "700" },
  menu_item_dir: { fontSize: 11, fontWeight: "700", color: palette.accentBlue },

  // --- Range slider ---
  slider_block: { paddingHorizontal: 4, marginTop: 4 },
  slider_value_row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  slider_value: { fontFamily: mono, fontSize: 13, fontWeight: "700", color: "#fff" },
  slider_track: { marginHorizontal: 12 },
  slider_container: { height: 32 },
  slider_rail: { height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.14)" },
  slider_marker: {
    height: 22,
    width: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
    borderWidth: 3,
    borderColor: palette.accentBlue,
  },
  slider_marker_pressed: {
    height: 26,
    width: 26,
    borderRadius: 13,
    backgroundColor: "#fff",
    borderWidth: 3,
    borderColor: palette.accentBlue,
  },

  // --- Countries ---
  country_search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 9,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  country_grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  country_item: {
    width: "48.5%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  country_item_on: { borderColor: palette.accentBlue, backgroundColor: palette.accentBlueSoft },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkbox_on: { borderColor: palette.accentBlue, backgroundColor: palette.accentBlue },
  checkbox_tick: { fontSize: 10, fontWeight: "900", color: "#fff" },
  country_flag: { fontSize: 15 },
  country_flag_img: { width: 18, height: 18, borderRadius: 2 },
  country_name: { flex: 1, fontSize: 12, fontWeight: "600", color: text.secondary },
  country_name_on: { color: "#fff" },
  country_empty: { fontSize: 12, color: text.muted, paddingVertical: 8 },
  show_more: { paddingVertical: 8, alignSelf: "flex-start" },
  show_more_label: { fontSize: 12, fontWeight: "700", color: palette.accentBlue },

  collapse_head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  collapse_caret: { fontSize: 12, color: text.secondary, marginTop: 8 },
  collapse_body: { gap: 6 },

  // --- Filters bottom sheet ---
  sheet_backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: palette.surfaceDeep,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: "88%",
    gap: 12,
  },
  sheet_handle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginBottom: 4,
  },
  sheet_head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheet_title: { fontSize: 18, fontWeight: "800", color: "#fff" },
  reset: {
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(255,255,255,0.7)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 7,
    overflow: "hidden",
  },
  reset_off: { color: "rgba(255,255,255,0.2)" },
  sheet_scroll: { flexGrow: 0 },
  sheet_scroll_content: { paddingBottom: 4 },

  sheet_footer: { flexDirection: "row", gap: 10, paddingTop: 4 },
  footer_reset: {
    paddingHorizontal: 20,
    justifyContent: "center",
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  footer_reset_off: { opacity: 0.5 },
  footer_reset_label: { fontSize: 14, fontWeight: "700", color: "#fff" },
  footer_apply: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 11,
    backgroundColor: palette.accentBlue,
  },
  footer_apply_label: { fontSize: 14, fontWeight: "800", color: "#fff" },

  // --- Player row (compact) ---
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 11,
    marginBottom: 7,
  },
  row_pressed: { backgroundColor: "rgba(255,255,255,0.08)" },
  star_hit: { paddingRight: 1 },
  star: { fontSize: 16, color: text.faint, lineHeight: 18 },
  star_on: { color: palette.accentBlue },
  hero: {
    width: 52,
    height: 56,
    borderRadius: 11,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  hero_photo: { position: "absolute", left: 0, right: 0, bottom: 0, width: "100%", height: "88%" },
  hero_num_chip: {
    position: "absolute",
    top: 3,
    left: 3,
    minWidth: 16,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 5,
    backgroundColor: "rgba(6,7,12,0.82)",
    alignItems: "center",
  },
  hero_num_chip_txt: { fontFamily: mono, fontSize: 9, fontWeight: "800", color: "#fff" },
  hero_num_big: { fontFamily: mono, fontSize: 22, fontWeight: "900", color: "#fff" },
  identity: { flex: 1, minWidth: 0, gap: 2 },
  name_row: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontSize: 14, fontWeight: "700", color: "#fff", flexShrink: 1 },
  held: {
    backgroundColor: "rgba(72,255,67,0.14)",
    borderWidth: 1,
    borderColor: "rgba(72,255,67,0.35)",
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  held_label: { fontSize: 8, fontWeight: "800", letterSpacing: 0.4, color: palette.brandGreen },
  meta_row: { flexDirection: "row", alignItems: "center", gap: 6 },
  meta_flag: { fontSize: 12 },
  meta_flag_img: { width: 15, height: 15, borderRadius: 2 },
  meta_text: { fontSize: 12, color: text.secondary, flexShrink: 1 },
  stat_line: { fontSize: 11, color: text.tertiary, fontFamily: mono, marginTop: 1 },
  price_col: { alignItems: "flex-end", gap: 2 },
  price: { fontFamily: mono, fontSize: 14, fontWeight: "800", color: "#fff" },
  price_pct: { fontFamily: mono, fontSize: 11, fontWeight: "700" },

  empty: { padding: 40, textAlign: "center", color: text.muted, fontSize: 13 },
});
