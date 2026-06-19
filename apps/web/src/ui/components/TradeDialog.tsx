// TradeDialog — buy/sell order entry (form -> submitting -> done).
//
// DDD role: UI presentation. A faithful web counterpart of the native
// TradeSheet (apps/mobile/components/TradeSheet.tsx): title + value line,
// Buy/Sell toggle, Percent/Shares mode, one slider (+ percent presets), a flat
// preview list, and a single confirm button; an inline "Bought/Sold -> Done"
// success state. Numbers come from the shared ``simulate_trade`` (core) and the
// order is placed via ``trades_api.execute`` — the same surface mobile uses, so
// the two cannot diverge. Presented through the shared Sheet (centred modal on
// desktop, bottom-sheet on phone).

import { useEffect, useState } from "react";
import { portfolio_api } from "@fundxi/core/api/portfolio_api";
import { trades_api } from "@fundxi/core/api/trades_api";
import { valuations_api } from "@fundxi/core/api/valuations_api";
import { simulate_trade, type TradeMode } from "@fundxi/core/application/trade_service";
import type { Player } from "@fundxi/core/domain/player/player";
import { Sheet } from "@/ui/components/Sheet";
import { fmt_eur_from_m, fmt_eur_m, fmt_eur_m_cash, fmt_eur_m_signed, fmt_shares } from "@/ui/helpers/format";

type Kind = "buy" | "sell";
type Phase = "form" | "submitting" | "done";

const PCT_PRESETS = [10, 25, 50, 100];

interface TradeDialogProps {
  open: boolean;
  player: Player;
  initial_kind: Kind;
  // Dismiss WITHOUT a completed trade (cancel / backdrop on the form). Closes
  // the dialog only — the player sheet behind it stays open.
  on_close: () => void;
  // Dismiss the DONE confirmation after a trade actually executed. Lets the
  // opener also close the player sheet and return to where the user was.
  // Falls back to on_close when not provided.
  on_finish?: () => void;
  // Kept for call-site compatibility (PlayerSheet passes it); the native-style
  // done view has a single "Done" action, so it is not used here.
  go_portfolio?: () => void;
  // Optional snapshot override — used when the caller already holds price data
  // (e.g. MatchView passing a MatchPlayer's value for an inline-only sub).
  current_price?: number;
}

export function TradeDialog({
  open,
  player,
  initial_kind,
  on_close,
  on_finish,
  current_price: current_price_override,
}: TradeDialogProps) {
  // Dismissing the DONE confirmation means the trade went through → hand back to
  // the opener so it can also close the player sheet (cancel keeps on_close).
  const finish = on_finish ?? on_close;
  const valuation = valuations_api.get_for_player(player.id);
  const current_price = current_price_override ?? valuation?.current_price ?? 0;

  const [kind_state, set_kind] = useState<Kind>(initial_kind);
  const [mode, set_mode] = useState<TradeMode>("percentage");
  const [percentage, set_percentage] = useState(10);
  const [shares, set_shares] = useState(0);
  const [phase, set_phase] = useState<Phase>("form");
  const [error, set_error] = useState<string | null>(null);
  const [done_shares, set_done_shares] = useState(0);
  const [done_price, set_done_price] = useState(0);
  const [done_total, set_done_total] = useState(0);

  // Reset every time the dialog re-opens (or the requested side changes).
  useEffect(() => {
    if (open) {
      set_kind(initial_kind);
      set_mode("percentage");
      set_percentage(10);
      set_shares(0);
      set_phase("form");
      set_error(null);
    }
  }, [open, initial_kind]);

  if (!open) return null;

  // Long-only: selling is only meaningful when there's a position to unwind.
  // With no holding, Sell can do nothing, so we disable it and force Buy.
  const has_position = portfolio_api.holds(player.id);
  const kind: Kind = has_position ? kind_state : "buy";
  const is_buy = kind === "buy";
  const accent = is_buy ? "var(--color-action-buy)" : "var(--color-action-sell)";

  const preview = simulate_trade({ player, kind, mode, percentage, shares, current_price });

  // Sizing ceilings come from the preview (computed once in core, shared web +
  // mobile): the shares-mode slider stops at max_trade_shares; the %-mode slider
  // travel stops at max_percentage so the control can't promise more than is
  // executable. We only keep the controlled-value clamp here.
  const slider_max = Math.max(1, preview.max_trade_shares);
  const pct_max = preview.max_percentage;
  const eff_percentage = Math.min(percentage, pct_max);

  const can_confirm = phase === "form" && !preview.insufficient_capital && preview.shares > 0;

  // Switching unit carries the value over instead of resetting to 0.
  const switch_mode = (next: TradeMode) => {
    if (next === mode) return;
    if (next === "shares") set_shares(Math.round(preview.display_shares));
    else set_percentage(Math.min(100, Math.max(1, preview.percentage_of_portfolio)));
    set_mode(next);
  };

  const confirm = () => {
    if (!can_confirm) return;
    set_phase("submitting");
    set_error(null);
    trades_api
      .execute({ player_id: player.id, kind, shares: preview.shares, price: current_price })
      .then(() => {
        set_done_shares(preview.display_shares);
        set_done_price(preview.price_per_share);
        set_done_total(preview.amount);
        set_phase("done");
      })
      .catch((err: unknown) => {
        set_error(err instanceof Error && err.message ? err.message : "Order failed. Please try again.");
        set_phase("form");
      });
  };

  // ── Done view ──
  if (phase === "done") {
    return (
      <Sheet
        open={true}
        on_close={finish}
        max_width={460}
        footer={
          <button onClick={finish} style={{ ...confirm_btn_style, background: accent }}>
            Done
          </button>
        }
      >
        <div style={{ padding: "28px 24px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: accent }}>{is_buy ? "Bought" : "Sold"}</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,.55)", marginBottom: 8 }}>
            {fmt_shares(done_shares)} shares of {player.name}
          </div>
          <div style={{ ...preview_box_style, alignSelf: "stretch" }}>
            <PreviewRow label="Shares" value={fmt_shares(done_shares)} />
            <PreviewRow label="Price" value={fmt_eur_from_m(done_price)} />
            <PreviewRow label="Total" value={fmt_eur_m(done_total)} color={accent} />
          </div>
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
        <button
          onClick={confirm}
          disabled={!can_confirm}
          style={{ ...confirm_btn_style, background: accent, opacity: can_confirm ? 1 : 0.4, cursor: can_confirm ? "pointer" : "default" }}
        >
          {phase === "submitting"
            ? "Placing…"
            : `${is_buy ? "Buy" : "Sell"} ${fmt_shares(preview.display_shares)} shares`}
        </button>
      }
    >
      <div style={{ padding: "8px 20px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{player.full_name ?? player.name}</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.55)", marginTop: 2 }}>
            Value {fmt_eur_m(current_price)} · {fmt_eur_from_m(preview.price_per_share)}/share
          </div>
        </div>

        {/* Buy / Sell — long-only: Sell stays visible but is disabled until you
            hold the player, so the view never shifts. */}
        <div style={{ display: "flex", gap: 8 }}>
          {(["buy", "sell"] as Kind[]).map(k => {
            const on = kind === k;
            const disabled = k === "sell" && !has_position;
            const c = k === "buy" ? "var(--color-action-buy)" : "var(--color-action-sell)";
            return (
              <button
                key={k}
                onClick={() => !disabled && set_kind(k)}
                disabled={disabled}
                title={disabled ? "You don't hold this player yet" : undefined}
                style={{
                  flex: 1,
                  padding: "11px 0",
                  borderRadius: 10,
                  border: "1px solid " + (on ? c : "rgba(255,255,255,.12)"),
                  background: on ? c : "rgba(255,255,255,.04)",
                  color: on ? "var(--color-bg)" : "#fff",
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.35 : 1,
                  fontFamily: "inherit",
                }}
              >
                {k === "buy" ? "Buy" : "Sell"}
              </button>
            );
          })}
        </div>

        {/* Mode: percent of portfolio vs exact shares */}
        <div style={{ display: "flex", gap: 8 }}>
          {(["percentage", "shares"] as TradeMode[]).map(m => {
            const on = mode === m;
            return (
              <button key={m} onClick={() => switch_mode(m)} style={mode_btn_style(on)}>
                {m === "percentage" ? "Percent" : "Shares"}
              </button>
            );
          })}
        </div>

        {/* Slider — fine control, with quick presets in percent mode */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.4)" }}>
            {mode === "percentage" ? (is_buy ? "% of cash" : "% of position") : "Shares"}
          </span>
          <span style={{ fontSize: 16, fontWeight: 800 }}>
            {mode === "percentage" ? `${eff_percentage}%` : fmt_shares(shares)}
          </span>
        </div>
        {mode === "percentage" ? (
          <input
            type="range"
            min={1}
            max={100}
            step={1}
            value={eff_percentage}
            onChange={e => set_percentage(Math.min(parseInt(e.target.value), pct_max))}
            style={{ width: "100%", accentColor: accent }}
          />
        ) : (
          <input
            type="range"
            min={0}
            max={slider_max}
            step={1}
            value={shares}
            onChange={e => set_shares(Math.round(parseFloat(e.target.value)))}
            style={{ width: "100%", accentColor: accent }}
          />
        )}
        {mode === "percentage" && (
          <div style={{ display: "flex", gap: 8 }}>
            {PCT_PRESETS.map(p => {
              // "Max" always lands on the real ceiling; a fixed preset above the
              // ceiling is disabled (it would do nothing).
              const target = p === 100 ? pct_max : p;
              const unavailable = p !== 100 && p > pct_max;
              const on = eff_percentage === target;
              return (
                <button
                  key={p}
                  disabled={unavailable}
                  onClick={() => set_percentage(target)}
                  style={{ ...mode_btn_style(on), opacity: unavailable ? 0.35 : 1, cursor: unavailable ? "not-allowed" : "pointer" }}
                >
                  {p === 100 ? "Max" : `${p}%`}
                </button>
              );
            })}
          </div>
        )}
        {/* Cap explainer — why the cash-% slider stops before 100%. */}
        {mode === "percentage" && is_buy && pct_max < 100 && (
          <div style={hint_style}>
            Stops at {pct_max}% of your cash — that already buys the whole {player.name}. A position can't exceed 100% of a
            player.
          </div>
        )}

        {/* Preview */}
        <div style={preview_box_style}>
          <PreviewRow label="Shares" value={fmt_shares(preview.display_shares)} />
          <PreviewRow label="Price / share" value={fmt_eur_from_m(preview.price_per_share)} />
          <PreviewRow label="Amount" value={fmt_eur_m(preview.amount)} />
          <PreviewRow label="Owned after" value={`${Math.round(preview.pct_of_player_after)}% of player`} />
          <PreviewRow label="% of portfolio" value={`${preview.percentage_of_portfolio.toFixed(1)}%`} />
          <PreviewRow label="Cash after" value={fmt_eur_m_cash(preview.cash_after)} />
          {preview.realized_pnl !== 0 && (
            <PreviewRow
              label="Realized P&L"
              value={fmt_eur_m_signed(preview.realized_pnl)}
              color={preview.realized_pnl >= 0 ? "var(--color-positive)" : "var(--color-negative)"}
            />
          )}
        </div>

        {preview.capped && (
          <div style={hint_style}>
            {is_buy
              ? `Capped at the whole player: a position can't exceed 100% of ${player.name} (${fmt_eur_m(current_price)} = ${fmt_shares(slider_max)} shares).`
              : `Capped at your holding: you can sell at most the ${fmt_shares(slider_max)} shares you own.`}
          </div>
        )}
        {preview.insufficient_capital && (
          <div style={error_style}>Insufficient cash — short by {fmt_eur_m(preview.shortfall)}.</div>
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

const mode_btn_style = (on: boolean): React.CSSProperties => ({
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
