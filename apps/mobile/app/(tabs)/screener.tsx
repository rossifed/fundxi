// Screener — RN port of apps/web/src/ui/pages/screener/ScreenerPage.tsx.
//
// The web surface is a wide multi-column grid table. On a phone that becomes a
// vertical FlatList of rich rows (same dataset, same filters, same tabs, same
// live price sync) with a horizontally-scrollable stat strip per row so every
// column's data stays present without a desktop-width grid. This is the
// "web adapted to native" mapping required by CLAUDE.md (single column,
// full-width, no parity break).

import { useMemo, useRef, useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

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
import { PlayerChip } from "@/components/PlayerChip";
import { PositionBadge } from "@/components/PositionBadge";
import { TickValue } from "@/components/TickValue";
import { PlayerSheet, type PlayerSheetHandle } from "@/components/PlayerSheet";
import { useLiveRefetch, usePricesLiveVersion } from "@/components/live";
import { useRefresh } from "@/components/use_refresh";
import { color_for_sign, fmt_signed_pct, price_label } from "@/lib/format";
import { toggle_set } from "@/lib/state";
import { useWatchlist, watchlist } from "@/lib/watchlist";
import { mono, palette, position_color, surface, text } from "@/theme/tokens";

type Tab = "valuation" | "statistics" | "personal";
type SortDir = "asc" | "desc";
type SortKey =
  | "name" | "value" | "since_start" | "last_match" | "avg_match"
  | "appearances" | "minutes_played" | "goals" | "assists" | "shots"
  | "yellow_cards" | "red_cards" | "key_passes" | "passes" | "passes_accuracy"
  | "rating_avg" | "age" | "height" | "weight";

interface StatCol {
  key: SortKey;
  label: string;
}

// Per-tab stat columns shown in the row's horizontal strip — mirrors the web
// tab column sets. The valuation tab also appends a Spark trend.
const TAB_COLS: Record<Tab, StatCol[]> = {
  valuation: [
    { key: "since_start", label: "All-time" },
    { key: "last_match", label: "Last" },
    { key: "avg_match", label: "Avg" },
  ],
  statistics: [
    { key: "appearances", label: "Apps" },
    { key: "minutes_played", label: "Min" },
    { key: "goals", label: "Goals" },
    { key: "assists", label: "Assists" },
    { key: "shots", label: "Shots" },
    { key: "yellow_cards", label: "🟨" },
    { key: "red_cards", label: "🟥" },
    { key: "key_passes", label: "Key P" },
    { key: "passes", label: "Passes" },
    { key: "passes_accuracy", label: "Pass %" },
    { key: "rating_avg", label: "Rating" },
  ],
  personal: [
    { key: "age", label: "Age" },
    { key: "height", label: "Ht" },
    { key: "weight", label: "Wt" },
  ],
};

const PRICE_BUCKETS: [number, number][] = [
  [0, 30],
  [30, 60],
  [60, 100],
  [100, 150],
  [150, 999],
];

export default function ScreenerScreen() {
  const sheet_ref = useRef<PlayerSheetHandle>(null);

  const [position_filters, set_position_filters] = useState<Set<Position>>(new Set());
  const [team_filters, set_team_filters] = useState<Set<string>>(new Set());
  const [price_range, set_price_range] = useState<[number, number]>([0, 999]);
  const [search, set_search] = useState("");
  const [show_filters, set_show_filters] = useState(false);
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

  const active_count =
    position_filters.size + team_filters.size + (price_range[0] > 0 || price_range[1] < 999 ? 1 : 0);
  const has_filters = active_count > 0;

  const set_sort = (key: SortKey) => {
    if (sort_key === key) set_sort_dir(sort_dir === "asc" ? "desc" : "asc");
    else {
      set_sort_key(key);
      set_sort_dir("desc");
    }
  };

  const open_player = (id: number) => {
    const p = players_api.get(id);
    if (p) sheet_ref.current?.open(p);
  };
  // Sort chips: Value + Name + the current tab's columns (replaces the web's
  // clickable column headers, which have no place in a single-column list).
  const sort_chips: StatCol[] = [
    { key: "value", label: "Value" },
    { key: "name", label: "Name" },
    ...TAB_COLS[tab],
  ];

  const header = (
    <View style={styles.header_block}>
      {/* Search + filter toggle */}
      <View style={styles.search_row}>
        <Pressable
          onPress={() => set_show_filters(s => !s)}
          style={[styles.filter_btn, show_filters && styles.filter_btn_on]}
        >
          <Text style={[styles.filter_btn_label, show_filters && styles.filter_btn_label_on]}>
            ⚙ Filters{active_count > 0 ? ` (${active_count})` : ""}
          </Text>
        </Pressable>
        <View style={styles.search_box}>
          <Text style={styles.search_icon}>🔍</Text>
          <TextInput
            value={search}
            onChangeText={set_search}
            placeholder="Search players, teams, clubs…"
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

      {show_filters && (
        <View style={styles.filter_panel}>
          <View style={styles.filter_panel_head}>
            <Text style={styles.filter_panel_title}>Filters</Text>
            <Pressable
              disabled={!has_filters}
              onPress={() => {
                set_position_filters(new Set());
                set_team_filters(new Set());
                set_price_range([0, 999]);
              }}
            >
              <Text style={[styles.reset, !has_filters && styles.reset_off]}>
                Reset all{has_filters ? ` (${active_count})` : ""}
              </Text>
            </Pressable>
          </View>

          <FilterLabel>Position</FilterLabel>
          <View style={styles.chip_wrap}>
            {(["FW", "MF", "DF", "GK"] as Position[]).map(p => {
              const on = position_filters.has(p);
              return (
                <Pressable
                  key={p}
                  onPress={() => toggle_set(position_filters, set_position_filters, p)}
                  style={[styles.chip, on && styles.chip_on]}
                >
                  <View style={[styles.pos_dot, { backgroundColor: position_color[p], opacity: on ? 1 : 0.4 }]} />
                  <Text style={[styles.chip_label, on && styles.chip_label_on]}>{POSITION_LABEL[p]}</Text>
                </Pressable>
              );
            })}
          </View>

          <FilterLabel>Price range</FilterLabel>
          <View style={styles.chip_wrap}>
            {PRICE_BUCKETS.map(([lo, hi]) => {
              const on = price_range[0] === lo && price_range[1] === hi;
              return (
                <Pressable
                  key={lo}
                  onPress={() => set_price_range(on ? [0, 999] : [lo, hi])}
                  style={[styles.chip, on && styles.chip_on]}
                >
                  <Text style={[styles.chip_label, on && styles.chip_label_on]}>
                    {price_label(lo)}–{price_label(hi)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <FilterLabel>Teams</FilterLabel>
          <View style={styles.chip_wrap}>
            {sorted_team_ids.map(id => {
              const team = teams_api.get(id);
              if (!team) return null;
              const on = team_filters.has(id);
              return (
                <Pressable
                  key={id}
                  onPress={() => toggle_set(team_filters, set_team_filters, id)}
                  style={[styles.chip, on && styles.chip_on]}
                >
                  <Text style={styles.chip_flag}>{team.flag}</Text>
                  <Text style={[styles.chip_label, on && styles.chip_label_on]}>{team.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* Tabs */}
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

      {/* Sort chips (replaces the web's sortable column headers) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sort_row}>
        <Text style={styles.sort_label}>Sort</Text>
        {sort_chips.map(c => {
          const on = sort_key === c.key;
          return (
            <Pressable key={c.key} onPress={() => set_sort(c.key)} style={[styles.sort_chip, on && styles.sort_chip_on]}>
              <Text style={[styles.sort_chip_label, on && styles.sort_chip_label_on]}>
                {c.label}
                {on ? (sort_dir === "asc" ? " ▲" : " ▼") : ""}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={styles.count}>{filtered.length} players</Text>
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
        initialNumToRender={14}
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
      <PlayerSheet ref={sheet_ref} />
    </View>
  );
}

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
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.row_pressed]} onPress={on_open} accessibilityRole="button">
      <View style={styles.row_top}>
        <Pressable onPress={on_toggle_watch} hitSlop={8}>
          <Text style={[styles.star, watched && styles.star_on]}>{watched ? "★" : "☆"}</Text>
        </Pressable>
        {e.image_path ? (
          <Image source={{ uri: e.image_path }} style={styles.avatar} resizeMode="contain" />
        ) : (
          <PlayerChip jersey_number={e.jersey_number} team_color={team?.color ?? "#666"} size={36} />
        )}
        <View style={styles.identity}>
          <View style={styles.name_row}>
            <Text style={styles.jersey}>{e.jersey_number}</Text>
            <Text style={styles.name} numberOfLines={1}>
              {e.name}
            </Text>
            {held && (
              <View style={styles.held}>
                <Text style={styles.held_label}>HELD</Text>
              </View>
            )}
          </View>
          <View style={styles.team_row}>
            {team?.flag_url ? (
              <Image source={{ uri: team.flag_url }} style={styles.team_flag_img} resizeMode="contain" />
            ) : (
              <Text style={styles.team_flag}>{team?.flag}</Text>
            )}
            <Text style={styles.team_name} numberOfLines={1}>
              {team?.name}
            </Text>
            <PositionBadge position={e.position as Position} abbr />
          </View>
        </View>
        <View style={styles.price_col}>
          <TickValue value={e.current_price}>
            <Text style={styles.price}>€{e.current_price.toFixed(2)}M</Text>
          </TickValue>
        </View>
      </View>

      {/* Hairline separates the player's identity from its stats inside the card */}
      <View style={styles.row_divider} />
      {/* Tab-specific stat strip (horizontal scroll keeps every column present) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stat_strip}>
        {TAB_COLS[tab].map(c => (
          <StatCell key={c.key} entry={e} col={c} />
        ))}
        {tab === "valuation" && (
          <View style={styles.spark_cell}>
            <Spark data={spark_for_player(e.id)} width={96} height={22} />
          </View>
        )}
      </ScrollView>
    </Pressable>
  );
}

function StatCell({ entry: e, col }: { entry: ScreenerEntry; col: StatCol }) {
  const { value, color } = stat_display(e, col.key);
  return (
    <View style={styles.stat_cell}>
      <Text style={styles.stat_label}>{col.label}</Text>
      <Text style={[styles.stat_value, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.filter_label}>{children}</Text>;
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

// Display value + optional colour per column — mirrors the web ScreenerCell.
function stat_display(e: ScreenerEntry, key: SortKey): { value: string; color?: string } {
  const pct = (v: number | null) => ({ value: fmt_signed_pct(v, 1), color: v == null ? text.tertiary : color_for_sign(v) });
  const int = (v: number | null) => ({ value: v == null ? "—" : String(v) });
  switch (key) {
    case "since_start": return pct(e.since_start_pct);
    case "last_match": return pct(e.last_match_pct);
    case "avg_match": return pct(e.avg_match_pct);
    case "appearances": return int(e.appearances);
    case "minutes_played": return int(e.minutes_played);
    case "goals": return { value: int(e.goals).value, color: (e.goals ?? 0) > 0 ? palette.positive : undefined };
    case "assists": return { value: int(e.assists).value, color: (e.assists ?? 0) > 0 ? palette.positive : undefined };
    case "shots": return { value: `${e.shots_on_target ?? 0}/${e.shots_total ?? 0}` };
    case "yellow_cards": return int(e.yellow_cards);
    case "red_cards": return { value: int(e.red_cards).value, color: (e.red_cards ?? 0) > 0 ? palette.negative : undefined };
    case "key_passes": return int(e.key_passes);
    case "passes": return int(e.passes_total);
    case "passes_accuracy": return { value: e.passes_accuracy != null ? `${e.passes_accuracy.toFixed(0)}%` : "—" };
    case "rating_avg": return { value: e.rating_avg != null ? e.rating_avg.toFixed(2) : "—" };
    case "age": return int(e.age);
    case "height": return { value: e.height != null ? `${e.height}cm` : "—" };
    case "weight": return { value: e.weight != null ? `${e.weight}kg` : "—" };
    default: return { value: "—" };
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list_content: { paddingHorizontal: 16, paddingBottom: 32 },
  header_block: { paddingTop: 12, gap: 12 },

  search_row: { flexDirection: "row", gap: 8 },
  filter_btn: {
    paddingHorizontal: 14,
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  filter_btn_on: { backgroundColor: surface.active },
  filter_btn_label: { fontSize: 12, fontWeight: "700", color: text.secondary },
  filter_btn_label_on: { color: "#fff" },
  search_box: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  search_icon: { fontSize: 14, color: text.muted },
  search_input: { flex: 1, color: "#fff", fontSize: 13, paddingVertical: 10 },
  search_clear: { fontSize: 13, color: text.muted, paddingHorizontal: 4 },

  filter_panel: {
    gap: 10,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
  },
  filter_panel_head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  filter_panel_title: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.55)",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  reset: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.7)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 6,
    overflow: "hidden",
  },
  reset_off: { color: "rgba(255,255,255,0.2)" },
  filter_label: {
    fontSize: 10,
    fontWeight: "700",
    color: text.tertiary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  chip_wrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  chip_on: { borderColor: "rgba(255,255,255,0.22)", backgroundColor: surface.active },
  chip_label: { fontSize: 12, fontWeight: "600", color: text.tertiary },
  chip_label_on: { color: "#fff" },
  chip_flag: { fontSize: 12 },
  pos_dot: { width: 6, height: 6, borderRadius: 2 },

  tabs: { flexDirection: "row", gap: 4 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  tab_on: { backgroundColor: surface.active },
  tab_label: {
    fontSize: 12,
    fontWeight: "700",
    color: text.tertiary,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  tab_label_on: { color: "#fff" },

  sort_row: { flexDirection: "row", alignItems: "center", gap: 6, paddingRight: 8 },
  sort_label: {
    fontSize: 10,
    fontWeight: "700",
    color: text.tertiary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginRight: 2,
  },
  sort_chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  sort_chip_on: { backgroundColor: surface.active, borderColor: "rgba(255,255,255,0.22)" },
  sort_chip_label: { fontSize: 11, fontWeight: "700", color: text.tertiary },
  sort_chip_label_on: { color: "#fff" },
  count: { fontSize: 11, color: text.tertiary, paddingHorizontal: 4 },

  row: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  row_pressed: { backgroundColor: "rgba(255,255,255,0.06)" },
  row_divider: { height: 1, backgroundColor: "rgba(255,255,255,0.05)" },
  row_top: { flexDirection: "row", alignItems: "center", gap: 10 },
  star: { fontSize: 16, color: text.faint, lineHeight: 18 },
  star_on: { color: "#fff" },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  identity: { flex: 1, minWidth: 0 },
  name_row: { flexDirection: "row", alignItems: "center", gap: 6 },
  jersey: { fontFamily: mono, fontSize: 11, fontWeight: "700", color: text.tertiary },
  name: { fontSize: 14, fontWeight: "700", color: "#fff", flexShrink: 1 },
  held: {
    backgroundColor: "rgba(72,255,67,0.14)",
    borderWidth: 1,
    borderColor: "rgba(72,255,67,0.35)",
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  held_label: { fontSize: 9, fontWeight: "800", letterSpacing: 0.4, color: palette.brandGreen },
  team_row: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  team_flag: { fontSize: 13 },
  team_flag_img: { width: 16, height: 16 },
  team_name: { fontSize: 12, color: text.secondary, flexShrink: 1 },
  price_col: { alignItems: "flex-end", minWidth: 78 },
  price: { fontFamily: mono, fontSize: 13, fontWeight: "700", color: "#fff" },

  stat_strip: { flexDirection: "row", gap: 16, paddingTop: 2, alignItems: "center" },
  stat_cell: { minWidth: 38 },
  spark_cell: { justifyContent: "center" },
  stat_label: {
    fontSize: 8,
    fontWeight: "700",
    color: text.muted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  stat_value: { fontFamily: mono, fontSize: 12, fontWeight: "700", color: "#fff" },

  empty: { padding: 40, textAlign: "center", color: text.muted, fontSize: 13 },
});
