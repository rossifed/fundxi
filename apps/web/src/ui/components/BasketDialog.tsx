// BasketDialog — "buy the team" multi-player order entry.
//
// DDD role: UI presentation. (Mobile counterpart not built yet — the basket is
// web-only for now; the @fundxi/core basket logic is shared and mobile-ready.)
// Pick a % of cash, an
// equal-vs-by-value split, toggle which players are in, see each leg's exposure
// and the running total, confirm once. Numbers come from the shared
// ``simulate_basket`` (core) and the order is placed via
// ``trades_api.execute_basket`` — the same surface mobile uses, so the two
// cannot diverge. Presented through the shared Sheet (centred modal on desktop,
// bottom-sheet on phone).

import { useEffect, useMemo, useState } from "react";
import { trades_api } from "@fundxi/core/api/trades_api";
import { trade_lock_caption, trade_lock_label, trading_locked_reason } from "@fundxi/core/api/trading_api";
import {
  type BasketOutcome,
  type BasketPreview,
  type BasketWeighting,
  simulate_basket,
} from "@fundxi/core/application/basket_service";
import type { Position } from "@fundxi/core/domain/player/player";
import { PlayerAvatar } from "@/ui/components/PlayerAvatar";
import { Sheet } from "@/ui/components/Sheet";
import { color, position_color } from "@/ui/design/tokens";
import { useLockedTeams } from "@/ui/hooks/use_trade_lock";
import { color_for_sign, fmt_eur_m, fmt_signed_pct } from "@/ui/helpers/format";

const PCT_PRESETS = [10, 25, 50, 100];

export interface BasketCandidate {
  id: number;
  // The player's team — used to freeze the leg while that team's match is live.
  team_id: string;
  name: string;
  position: Position;
  jersey_number: number;
  image_path: string | null;
  // The player's whole market value (price), read from the valuation by the
  // caller — used to sort the list and show the "valo", selection-independent.
  value: number;
  // Tournament playing time — a titular (starter) signal. Provider data
  // (core stats); null when the player has no stats yet. Never invented.
  appearances: number | null;
  minutes_played: number | null;
  // Total performance since the tournament opened (%), from the valuation —
  // used with appearances to show an average-per-match performance.
  change_since_inception: number;
}

interface BasketDialogProps {
  open: boolean;
  title: string; // e.g. "Buy France"
  accent: string; // team color
  players: BasketCandidate[];
  // Players pre-selected on open (e.g. the starting XI when known). Defaults to
  // every candidate when omitted.
  initial_selected?: number[];
  // Open the player's detail (the checkbox selects; the rest of the row opens).
  on_open_player: (player_id: number) => void;
  on_close: () => void;
}

type Phase = "form" | "submitting" | "done";

export function BasketDialog({ open, title, accent, players, initial_selected, on_open_player, on_close }: BasketDialogProps) {
  const [percentage, set_percentage] = useState(10);
  const [weighting, set_weighting] = useState<BasketWeighting>("equal");
  const [selected, set_selected] = useState<Set<number>>(new Set());
  const [phase, set_phase] = useState<Phase>("form");
  const [error, set_error] = useState<string | null>(null);
  const [outcome, set_outcome] = useState<BasketOutcome | null>(null);
  const locked_teams_map = useLockedTeams();

  // Reset ONLY when the dialog opens (false → true). It must NOT depend on
  // `players`/`initial_selected` identity: those arrays are rebuilt on every
  // parent re-render (live price ticks ~3s), and re-running this would wipe the
  // user's manual de/selection mid-use. Player ids are stable, so the selection
  // set stays valid across re-renders.
  useEffect(() => {
    if (!open) return;
    set_percentage(10);
    set_weighting("equal");
    set_selected(new Set(initial_selected ?? players.map(p => p.id)));
    set_phase("form");
    set_error(null);
    set_outcome(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on open only
  }, [open]);

  // Biggest market cap first — easiest to scan the stars at the top.
  const sorted_players = useMemo(() => [...players].sort((a, b) => b.value - a.value), [players]);
  const selected_ids = useMemo(() => players.map(p => p.id).filter(id => selected.has(id)), [players, selected]);

  const preview: BasketPreview = simulate_basket({ player_ids: selected_ids, percentage, weighting });
  const line_by_id = useMemo(() => new Map(preview.lines.map(l => [l.player_id, l])), [preview]);
  const buyable = preview.lines.filter(l => l.shares > 0).length;

  if (!open) return null;

  const toggle = (id: number) =>
    set_selected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Select-all / deselect-all — one click to clear, then cherry-pick a few.
  const all_selected = players.length > 0 && selected_ids.length === players.length;
  const toggle_all = () => set_selected(all_selected ? new Set() : new Set(players.map(p => p.id)));

  // Freeze the basket while any SELECTED player's match is live (the server
  // would reject those legs); explain rather than half-fail.
  const locked_reason = (() => {
    for (const p of players) {
      if (!selected.has(p.id)) continue;
      const lk = locked_teams_map.get(p.team_id);
      if (lk) return lk.reason;
    }
    return null;
  })();
  const any_locked = locked_reason !== null;

  const can_confirm = phase === "form" && !any_locked && buyable > 0 && preview.total_amount > 0;

  const confirm = () => {
    if (!can_confirm) return;
    set_phase("submitting");
    set_error(null);
    const buys = preview.lines
      .filter(l => l.shares > 0)
      .map(l => ({ player_id: l.player_id, shares: l.shares, price: l.total_value }));
    trades_api
      .execute_basket(buys)
      .then(result => {
        set_outcome(result);
        set_phase("done");
      })
      .catch((err: unknown) => {
        const reason = trading_locked_reason(err);
        set_error(
          reason
            ? `A player is in a live match. ${trade_lock_caption(reason)}.`
            : err instanceof Error && err.message
              ? err.message
              : "Order failed. Please try again.",
        );
        set_phase("form");
      });
  };

  // ── Done view ──
  if (phase === "done" && outcome) {
    return (
      <Sheet
        open={true}
        on_close={on_close}
        max_width={460}
        footer={
          <button onClick={on_close} style={{ ...confirm_btn_style, background: "var(--color-action-buy)" }}>
            Done
          </button>
        }
      >
        <div style={{ padding: "28px 24px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: "var(--color-action-buy)" }}>Bought</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,.55)", marginBottom: 8, textAlign: "center" }}>
            {outcome.bought.length} {outcome.bought.length === 1 ? "player" : "players"} added to your portfolio
          </div>
          {outcome.failed.length > 0 && (
            <div style={{ ...error_style, alignSelf: "stretch", textAlign: "center" }}>
              {outcome.failed.length} could not be bought (no price or cap reached).
            </div>
          )}
        </div>
      </Sheet>
    );
  }

  // ── Form view ──
  return (
    <Sheet
      open={true}
      on_close={on_close}
      max_width={460}
      footer={
        any_locked ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <button
              disabled
              style={{ ...confirm_btn_style, width: "100%", background: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.6)", cursor: "not-allowed" }}
            >
              {trade_lock_label(locked_reason ?? undefined)}
            </button>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,.5)" }}>
              A selected player is in a live match · {trade_lock_caption(locked_reason ?? undefined)}
            </span>
          </div>
        ) : (
          <button
            onClick={confirm}
            disabled={!can_confirm}
            style={{ ...confirm_btn_style, background: "var(--color-action-buy)", opacity: can_confirm ? 1 : 0.4, cursor: can_confirm ? "pointer" : "default" }}
          >
            {phase === "submitting"
              ? "Placing…"
              : `Buy ${buyable} ${buyable === 1 ? "player" : "players"} · ${fmt_eur_m(preview.total_amount)}`}
          </button>
        )
      }
    >
      <div style={{ padding: "8px 20px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{title}</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.55)", marginTop: 2 }}>
            Cash {fmt_eur_m(preview.cash_before)} · investing {fmt_eur_m(preview.total_amount)}
          </div>
        </div>

        {/* Weighting: equal € per player vs proportional to value */}
        <div style={{ display: "flex", gap: 8 }}>
          {(
            [
              { key: "equal", label: "Equal weight" },
              { key: "market_value", label: "Total value weight" },
            ] as { key: BasketWeighting; label: string }[]
          ).map(w => (
            <button key={w.key} onClick={() => set_weighting(w.key)} style={seg_btn_style(weighting === w.key)}>
              {w.label}
            </button>
          ))}
        </div>

        {/* % of cash slider + presets */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.4)" }}>% of cash</span>
          <span style={{ fontSize: 16, fontWeight: 800 }}>{percentage}%</span>
        </div>
        <input
          type="range"
          min={1}
          max={100}
          step={1}
          value={percentage}
          onChange={e => set_percentage(parseInt(e.target.value))}
          style={{ width: "100%", accentColor: accent }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          {PCT_PRESETS.map(p => (
            <button key={p} onClick={() => set_percentage(p)} style={seg_btn_style(percentage === p)}>
              {p === 100 ? "Max" : `${p}%`}
            </button>
          ))}
        </div>

        {/* List header — label + select-all/deselect-all toggle. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.4)" }}>
            {selected_ids.length} of {players.length} players
          </span>
          <button
            onClick={toggle_all}
            style={{
              background: "transparent",
              border: "none",
              padding: "2px 4px",
              fontSize: 12,
              fontWeight: 800,
              color: color.accentBlue,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {all_selected ? "Deselect all" : "Select all"}
          </button>
        </div>

        {/* Per-player rows — toggle in/out, see each leg's exposure */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto" }}>
          {sorted_players.map(p => {
            const on = selected.has(p.id);
            const line = line_by_id.get(p.id);
            const pos_accent = position_color[p.position];
            const valo = p.value;
            const avg_per_match = p.appearances && p.appearances > 0 ? p.change_since_inception / p.appearances : null;
            return (
              // The ROW opens the player's detail; only the checkbox (and its
              // padded hit area) toggles selection — so a mis-aimed tap near the
              // box selects instead of opening the sheet.
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => on_open_player(p.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 10px",
                  borderRadius: 10,
                  border: "1px solid " + (on ? color.accentBlue : "rgba(255,255,255,.06)"),
                  background: on ? color.accentBlueSoft : "transparent",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                <button
                  type="button"
                  aria-label={on ? "Deselect player" : "Select player"}
                  onClick={e => {
                    e.stopPropagation();
                    toggle(p.id);
                  }}
                  style={{
                    padding: 6,
                    margin: -2,
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    display: "flex",
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 4,
                      border: "1.5px solid " + (on ? color.accentBlue : "rgba(255,255,255,.3)"),
                      background: on ? color.accentBlue : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 900,
                      color: "#fff",
                    }}
                  >
                    {on ? "✓" : ""}
                  </span>
                </button>
                <PlayerAvatar image_path={p.image_path} size={34} radius={8} fit="cover" team_color={color.accentBlue} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Jersey number BEFORE the name, no "#". */}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
                    <span className="mono" style={{ fontSize: 11, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                      {p.jersey_number}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.name}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 7, marginTop: 2 }}>
                    <span style={{ fontSize: 9.5, fontWeight: 800, color: pos_accent }}>{p.position}</span>
                    <span className="mono" style={{ fontSize: 11.5, fontWeight: 800, color: "#fff" }}>{fmt_eur_m(valo)}</span>
                    {/* Titular signal — matches + minutes (real provider stats). */}
                    {(p.appearances != null || p.minutes_played != null) && (
                      <span className="mono" style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(255,255,255,.7)" }}>
                        {p.appearances != null ? `${p.appearances} MP` : ""}
                        {p.appearances != null && p.minutes_played != null ? " · " : ""}
                        {p.minutes_played != null ? `${p.minutes_played}'` : ""}
                      </span>
                    )}
                    {/* Total performance + average per match. */}
                    <span className="mono" style={{ fontSize: 10.5, fontWeight: 800, color: color_for_sign(p.change_since_inception) }}>
                      {fmt_signed_pct(p.change_since_inception)}
                    </span>
                    {avg_per_match != null && (
                      <span className="mono" style={{ fontSize: 10.5, fontWeight: 700, color: color_for_sign(avg_per_match) }}>
                        {fmt_signed_pct(avg_per_match)}/M
                      </span>
                    )}
                  </div>
                </div>
                {/* Per-player invested amount (weight) — white. */}
                <span
                  className="mono"
                  style={{ fontSize: 13, fontWeight: 800, color: on && line && line.amount > 0 ? "#fff" : "rgba(255,255,255,.3)", flexShrink: 0 }}
                >
                  {on && line && line.amount > 0 ? fmt_eur_m(line.amount) : "—"}
                </span>
              </div>
            );
          })}
        </div>

        {/* Total exposure */}
        <div style={preview_box_style}>
          <PreviewRow label="Players" value={`${selected_ids.length} of ${players.length} selected`} />
          <PreviewRow label="Total exposure" value={fmt_eur_m(preview.total_amount)} color={accent} />
          <PreviewRow label="Cash after" value={fmt_eur_m(preview.cash_after)} />
        </div>

        {buyable === 0 && selected_ids.length > 0 && (
          <div style={hint_style}>Budget too small to buy a whole share of any selected player — raise the %.</div>
        )}
        {error && <div style={error_style}>{error}</div>}
      </div>
    </Sheet>
  );
}

function PreviewRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.4)" }}>{label}</span>
      <span className="mono" style={{ fontSize: 13, fontWeight: 800, color: color ?? "#fff" }}>{value}</span>
    </div>
  );
}

const seg_btn_style = (on: boolean): React.CSSProperties => ({
  flex: 1,
  padding: "9px 0",
  borderRadius: 8,
  border: "1px solid " + (on ? "rgba(255,255,255,.25)" : "rgba(255,255,255,.1)"),
  background: on ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.03)",
  color: on ? "#fff" : "rgba(255,255,255,.55)",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
});

const preview_box_style: React.CSSProperties = {
  background: "rgba(255,255,255,.03)",
  borderRadius: 10,
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 7,
};

const hint_style: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.4,
  color: "rgba(255,255,255,.6)",
  background: "rgba(255,255,255,.03)",
  borderRadius: 8,
  padding: 10,
};

const error_style: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--color-negative)",
};

const confirm_btn_style: React.CSSProperties = {
  width: "100%",
  padding: "14px 0",
  borderRadius: 10,
  border: "none",
  color: "var(--color-bg)",
  fontSize: 15,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: "inherit",
};
