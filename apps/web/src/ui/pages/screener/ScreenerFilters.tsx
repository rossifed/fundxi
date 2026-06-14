// Screener filter sheet — the web parity of the native FiltersSheet
// (apps/mobile/app/(tabs)/screener.tsx). Same controls and structure: active
// filter chips, position chips, Price/Performance dual-thumb sliders (+ preset
// chips), a country search + checkbox grid, an "Other filters" collapsible
// (Age slider + ownership), and a "Show N players" footer. Presented via the
// shared Sheet (centred modal on desktop, bottom-sheet on phone).
//
// DDD role: React presentation (container). All filter state is owned by
// ScreenerPage and passed in; this component only renders + mutates it.

import { useState, type ReactNode } from "react";
import { teams_api } from "@fundxi/core/api/teams_api";
import { POSITION_LABEL, type Position } from "@fundxi/core/domain/player/player";
import type { Range } from "@fundxi/core/application/screener_filter";
import { Sheet } from "@/ui/components/Sheet";
import { RangeSlider } from "@/ui/components/RangeSlider";
import { color, position_color } from "@/ui/design/tokens";
import { toggle_set } from "@/ui/helpers/state";

const PERF_PRESETS: Range[] = [
  [-20, 0],
  [0, 10],
  [10, 30],
  [30, 999],
];
const COUNTRY_LIMIT = 10;

const clamp_range = (r: Range, bounds: Range): Range => [
  Math.max(r[0], bounds[0]),
  Math.min(r[1], bounds[1]),
];
const range_eq = (a: Range | null, b: Range): boolean => a != null && a[0] === b[0] && a[1] === b[1];

function fmt_price_range([lo, hi]: Range, price_max: number): string {
  return hi >= price_max ? `€${lo}M+` : `€${lo}M – €${hi}M`;
}
function fmt_perf_range([lo, hi]: Range): string {
  const s = (v: number) => `${v >= 0 ? "+" : ""}${v}%`;
  return hi >= 999 ? `${s(lo)}+` : `${s(lo)} – ${s(hi)}`;
}

export interface ActiveChip {
  key: string;
  label: string;
  flag?: string;
  flag_url?: string;
  clear: () => void;
}

interface ScreenerFiltersProps {
  open: boolean;
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
}

export function ScreenerFilters({
  open,
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
}: ScreenerFiltersProps) {
  const [country_q, set_country_q] = useState("");
  const [show_all_countries, set_show_all_countries] = useState(false);
  const [other_open, set_other_open] = useState(false);

  const price_presets: Range[] = ([[0, 30], [30, 60], [60, 100], [100, price_max]] as Range[]).filter(
    ([lo]) => lo < price_max,
  );

  // A slider spanning the full bounds means "no filter" (null).
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

  const footer = (
    <div style={{ display: "flex", gap: 10 }}>
      <button
        type="button"
        disabled={!has_filters}
        onClick={on_reset}
        style={{
          padding: "0 20px",
          borderRadius: 11,
          border: "1px solid rgba(255,255,255,.12)",
          background: "rgba(255,255,255,.04)",
          color: has_filters ? "#fff" : "rgba(255,255,255,.3)",
          fontSize: 14,
          fontWeight: 700,
          cursor: has_filters ? "pointer" : "default",
          fontFamily: "inherit",
        }}
      >
        Reset
      </button>
      <button
        type="button"
        onClick={on_close}
        style={{
          flex: 1,
          padding: "14px 0",
          borderRadius: 11,
          border: "none",
          background: color.accentBlue,
          color: "#fff",
          fontSize: 14,
          fontWeight: 800,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Show {result_count} players
      </button>
    </div>
  );

  return (
    <Sheet open={open} on_close={on_close} max_width={560} footer={footer}>
      <div style={{ padding: "20px 20px 8px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 18, fontWeight: 800 }}>Filters</span>
          <button
            type="button"
            disabled={!has_filters}
            onClick={on_reset}
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,.1)",
              borderRadius: 7,
              padding: "6px 12px",
              color: has_filters ? "rgba(255,255,255,.7)" : "rgba(255,255,255,.2)",
              fontSize: 12,
              fontWeight: 700,
              cursor: has_filters ? "pointer" : "default",
              fontFamily: "inherit",
            }}
          >
            Reset all{has_filters ? ` (${active_count})` : ""}
          </button>
        </div>

        {active_chips.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {active_chips.map(c => (
              <button key={c.key} type="button" onClick={c.clear} style={active_chip_style}>
                {c.flag_url ? (
                  <img src={c.flag_url} alt="" style={{ width: 15, height: 15, objectFit: "contain" }} />
                ) : c.flag ? (
                  <span style={{ fontSize: 12 }}>{c.flag}</span>
                ) : null}
                <span>{c.label}</span>
                <span style={{ fontSize: 10, opacity: 0.7 }}>✕</span>
              </button>
            ))}
          </div>
        )}

        <FilterLabel>Position</FilterLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <Chip active={position_filters.size === 0} on_click={() => set_position_filters(new Set())}>
            All
          </Chip>
          {(["FW", "MF", "DF", "GK"] as Position[]).map(p => {
            const on = position_filters.has(p);
            return (
              <Chip key={p} active={on} on_click={() => toggle_set(position_filters, set_position_filters, p)}>
                <span style={{ width: 6, height: 6, borderRadius: 2, background: position_color[p], opacity: on ? 1 : 0.4 }} />
                {POSITION_LABEL[p]}
              </Chip>
            );
          })}
        </div>

        <FilterLabel>Price range</FilterLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {price_presets.map(preset => {
            const c = clamp_range(preset, price_bounds);
            return (
              <Chip key={preset[0]} active={range_eq(price_range, c)} on_click={() => toggle_price(preset)}>
                {fmt_price_range(preset, price_max)}
              </Chip>
            );
          })}
        </div>
        <RangeSlider
          min={price_bounds[0]}
          max={price_bounds[1]}
          step={5}
          value={price_range ?? price_bounds}
          on_change={on_price}
          format={v => `€${v}M`}
        />

        <FilterLabel>Performance</FilterLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {PERF_PRESETS.map(preset => {
            const c = clamp_range(preset, perf_bounds);
            return (
              <Chip key={preset[0]} active={range_eq(perf_range, c)} on_click={() => toggle_perf(preset)}>
                {fmt_perf_range(preset)}
              </Chip>
            );
          })}
        </div>
        <RangeSlider
          min={perf_bounds[0]}
          max={perf_bounds[1]}
          step={5}
          value={perf_range ?? perf_bounds}
          on_change={on_perf}
          format={v => `${v >= 0 ? "+" : ""}${v}%`}
        />

        <FilterLabel>Countries</FilterLabel>
        <div style={search_box_style}>
          <span style={{ fontSize: 14, color: "rgba(255,255,255,.25)" }}>🔍</span>
          <input
            value={country_q}
            onChange={e => set_country_q(e.target.value)}
            placeholder="Search countries..."
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#fff", fontSize: 13, fontFamily: "inherit", padding: "9px 0", minWidth: 0 }}
          />
          {country_q && (
            <span onClick={() => set_country_q("")} style={{ fontSize: 13, color: "rgba(255,255,255,.25)", cursor: "pointer" }}>✕</span>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {countries.map(({ id, team }) => {
            const on = team_filters.has(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggle_set(team_filters, set_team_filters, id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 10px",
                  borderRadius: 9,
                  border: "1px solid " + (on ? "rgba(47,107,255,.6)" : "rgba(255,255,255,.08)"),
                  background: on ? color.accentBlueSoft : "rgba(255,255,255,.03)",
                  color: on ? "#fff" : "rgba(255,255,255,.6)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    flexShrink: 0,
                    border: "1.5px solid " + (on ? color.accentBlue : "rgba(255,255,255,.25)"),
                    background: on ? color.accentBlue : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 900,
                    color: "#fff",
                  }}
                >
                  {on ? "✓" : ""}
                </span>
                {team.flag_url ? (
                  <img src={team.flag_url} alt="" style={{ width: 18, height: 18, objectFit: "contain", flexShrink: 0 }} />
                ) : (
                  <span style={{ fontSize: 15 }}>{team.flag}</span>
                )}
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{team.name}</span>
              </button>
            );
          })}
          {countries.length === 0 && (
            <span style={{ fontSize: 12, color: "rgba(255,255,255,.25)", padding: "6px 0" }}>No country matches</span>
          )}
        </div>
        {!searching && all_countries.length > COUNTRY_LIMIT && (
          <button
            type="button"
            onClick={() => set_show_all_countries(s => !s)}
            style={{ alignSelf: "flex-start", background: "transparent", border: "none", color: color.accentBlue, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: "2px 0" }}
          >
            {show_all_countries ? "Show less" : `Show all ${all_countries.length}`}
          </button>
        )}

        {/* Other filters — collapsible. Only data-backed controls (Age +
            ownership); no faked market-trend / risk filters. */}
        <button
          type="button"
          onClick={() => set_other_open(o => !o)}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "transparent", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}
        >
          <FilterLabel>Other filters</FilterLabel>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,.5)" }}>{other_open ? "▾" : "▸"}</span>
        </button>
        {other_open && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.35)", letterSpacing: 0.4, textTransform: "uppercase" }}>Age</span>
            <RangeSlider
              min={age_bounds[0]}
              max={age_bounds[1]}
              step={1}
              value={age_range ?? age_bounds}
              on_change={on_age}
              format={v => `${v}`}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <Chip active={held_only} on_click={() => set_held_only(!held_only)}>In portfolio</Chip>
              <Chip active={watch_only} on_click={() => set_watch_only(!watch_only)}>★ Watchlist</Chip>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function FilterLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.4)", letterSpacing: 0.5, textTransform: "uppercase" }}>
      {children}
    </div>
  );
}

function Chip({ active, on_click, children }: { active: boolean; on_click: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={on_click}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "8px 12px",
        borderRadius: 9,
        border: "1px solid " + (active ? "rgba(47,107,255,.6)" : "rgba(255,255,255,.08)"),
        background: active ? color.accentBlueSoft : "rgba(255,255,255,.03)",
        color: active ? "#fff" : "rgba(255,255,255,.5)",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}

const active_chip_style: React.CSSProperties = {
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
};

const search_box_style: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  background: "rgba(255,255,255,.04)",
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 9,
  padding: "0 12px",
};
