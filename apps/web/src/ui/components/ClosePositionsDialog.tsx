/* ClosePositionsDialog — confirm + execute a batch position close.
 *
 * DDD role: UI presentation component. Holds no business logic — the
 * batch orchestration lives in the ``close_positions`` Use Case, wired
 * through ``trades_api.close_positions``.
 *
 * Three phases: confirm (recap of what will be sold) -> submitting ->
 * result (closed vs failed, so partial failures are surfaced).
 */

import { useEffect, useState, type CSSProperties } from "react";
import { trades_api, type CloseOutcome } from "@fundxi/core/api/trades_api";
import { trade_lock_caption, trading_locked_reason } from "@fundxi/core/api/trading_api";
import type { Player } from "@fundxi/core/domain/player/player";
import type { HoldingMetrics } from "@fundxi/core/domain/portfolio/portfolio_metrics";
import { Sheet } from "@/ui/components/Sheet";
import { useLockedTeams } from "@/ui/hooks/use_trade_lock";
import { color_for_sign, fmt_eur_m, fmt_eur_m_signed } from "@/ui/helpers/format";

/** A position the dialog can close — a holding with its live metrics
 * plus the resolved player (for display). Structurally a HoldingDetail. */
export type ClosablePosition = HoldingMetrics & { player: Player };

interface ClosePositionsDialogProps {
  open: boolean;
  positions: ClosablePosition[];
  // Dismiss the dialog (cancel before executing, or close the result view when
  // no on_finish is given). Closes the dialog only.
  on_close: () => void;
  // Dismiss the RESULT view after positions were actually closed. Lets the
  // opener also close the player sheet. Falls back to on_close when absent.
  on_finish?: () => void;
}

type Phase = "confirm" | "submitting" | "result";

const SURFACE = "rgba(255,255,255,.025)";
const SURFACE_BORDER = "1px solid rgba(255,255,255,.05)";

export function ClosePositionsDialog({ open, positions, on_close, on_finish }: ClosePositionsDialogProps) {
  // Leaving the result view means the close went through → hand back to the
  // opener so it can also dismiss the player sheet (cancel keeps on_close).
  const finish = on_finish ?? on_close;
  const [phase, set_phase] = useState<Phase>("confirm");
  const [result, set_result] = useState<CloseOutcome | null>(null);
  const [error, set_error] = useState<string | null>(null);
  const locked = useLockedTeams();

  // Reset every time the dialog re-opens.
  useEffect(() => {
    if (open) {
      set_phase("confirm");
      set_result(null);
      set_error(null);
    }
  }, [open]);

  if (!open) return null;

  // A position whose team is mid-match can't be closed (server rejects it) —
  // block the batch and explain, rather than letting it partially fail.
  const locked_count = positions.filter(p => locked.get(p.player.team_id)).length;
  const any_locked = locked_count > 0;

  const count = positions.length;
  // Sum of market values = net cash delta: a long close pays cash in, a
  // short close (buy to cover) pays cash out, so the total can be < 0.
  const net_cash = positions.reduce((sum, p) => sum + p.market_value, 0);
  // Closing a position in full realises exactly its unrealised P&L.
  const realised = positions.reduce((sum, p) => sum + p.pnl, 0);
  const name_of = new Map(positions.map(p => [p.player_id, p.player.name]));

  const on_confirm = () => {
    set_phase("submitting");
    set_error(null);
    trades_api
      .close_positions(positions.map(p => ({ player_id: p.player_id, shares: p.shares, price: p.current_price })))
      .then(outcome => {
        set_result(outcome);
        set_phase("result");
      })
      .catch((err: unknown) => {
        const reason = trading_locked_reason(err);
        set_error(
          reason ? `A player is in a live match. ${trade_lock_caption(reason)}.` : err instanceof Error ? err.message : String(err),
        );
        set_phase("confirm");
      });
  };

  // -- Result phase --
  if (phase === "result" && result) {
    const ok = result.closed.length;
    const ko = result.failed.length;
    const all_ok = ko === 0;
    return (
      <Sheet
        open={true}
        on_close={finish}
        max_width={460}
        footer={
          <button onClick={finish} style={primary_button_style}>
            Done
          </button>
        }
      >
        <div style={{ padding: "28px 24px 20px", textAlign: "center" }}>
          <div
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: all_ok ? "var(--color-positive)" : "var(--color-negative)",
              marginBottom: 4,
            }}
          >
            {all_ok ? `${ok} position${ok > 1 ? "s" : ""} closed` : `${ok} closed · ${ko} failed`}
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.55)" }}>
            {all_ok ? "Your positions have been sold out." : "Some positions could not be closed."}
          </div>
        </div>
        {ko > 0 && (
          <div style={{ padding: "0 24px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
            {result.failed.map(f => (
              <div
                key={f.player_id}
                style={{
                  background: "color-mix(in srgb, var(--color-negative) 8%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--color-negative) 25%, transparent)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 12,
                }}
              >
                <span style={{ fontWeight: 700 }}>{name_of.get(f.player_id) ?? `#${f.player_id}`}</span>
                <span style={{ color: "rgba(255,255,255,.55)" }}> — {f.error}</span>
              </div>
            ))}
          </div>
        )}
      </Sheet>
    );
  }

  // -- Confirm / submitting phase --
  const submitting = phase === "submitting";
  return (
    <Sheet
      open={true}
      on_close={submitting ? () => {} : on_close}
      max_width={460}
      footer={
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={on_close} disabled={submitting} style={cancel_button_style(submitting)}>
            Cancel
          </button>
          <button
            onClick={on_confirm}
            disabled={submitting || any_locked}
            style={confirm_button_style(submitting || any_locked)}
          >
            {any_locked ? "Live" : submitting ? "Closing…" : `Close ${count} position${count > 1 ? "s" : ""}`}
          </button>
        </div>
      }
    >
      <div style={{ padding: "8px 20px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>
          Close {count} position{count > 1 ? "s" : ""}?
        </div>

        {/* Position list */}
        <div
          className="scroll-visible"
          style={{
            background: SURFACE,
            border: SURFACE_BORDER,
            borderRadius: 10,
            maxHeight: 240,
            overflowY: "auto",
          }}
        >
          {positions.map((p, i) => (
            <div
              key={p.player_id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "9px 14px",
                borderBottom: i < positions.length - 1 ? "1px solid rgba(255,255,255,.04)" : undefined,
                fontSize: 13,
              }}
            >
              <span style={{ fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.player.name}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                <span className="mono" style={{ color: "rgba(255,255,255,.65)" }}>{fmt_eur_m(p.market_value)}</span>
                <span className="mono" style={{ fontWeight: 700, color: color_for_sign(p.pnl), minWidth: 64, textAlign: "right" }}>
                  {fmt_eur_m_signed(p.pnl)}
                </span>
              </span>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div
          style={{
            background: SURFACE,
            border: SURFACE_BORDER,
            borderRadius: 10,
            padding: "10px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <TotalRow label="Net cash" value={fmt_eur_m_signed(net_cash)} accent={color_for_sign(net_cash)} />
          <TotalRow label="Realised P&L" value={fmt_eur_m_signed(realised)} accent={color_for_sign(realised)} />
        </div>

        {any_locked && (
          <div
            style={{
              background: "rgba(255,255,255,.04)",
              border: "1px solid rgba(255,255,255,.07)",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 12,
              color: "rgba(255,255,255,.7)",
              lineHeight: 1.5,
            }}
          >
            {locked_count === count ? "Match live" : `${locked_count} of these are in a live match`} — trading
            reopens at half-time. You can close after the whistle.
          </div>
        )}

        {error && (
          <div
            style={{
              background: "color-mix(in srgb, var(--color-negative) 8%, transparent)",
              border: "1px solid color-mix(in srgb, var(--color-negative) 25%, transparent)",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 12,
              color: "rgba(255,255,255,.7)",
            }}
          >
            <strong style={{ color: "var(--color-negative)" }}>Could not close.</strong> {error}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function TotalRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
      <span style={{ color: "rgba(255,255,255,.4)" }}>{label}</span>
      <span className="mono" style={{ fontWeight: 800, fontSize: 14, color: accent ?? "#fff" }}>
        {value}
      </span>
    </div>
  );
}

const primary_button_style: CSSProperties = {
  width: "100%",
  padding: "12px 0",
  fontSize: 13,
  fontWeight: 800,
  borderRadius: 10,
  background: "rgba(255,255,255,.08)",
  color: "#fff",
  border: "none",
  cursor: "pointer",
  fontFamily: "inherit",
};

function cancel_button_style(disabled: boolean): CSSProperties {
  return {
    flex: 1,
    padding: "12px 0",
    fontSize: 13,
    fontWeight: 700,
    borderRadius: 10,
    background: "rgba(255,255,255,.04)",
    color: "rgba(255,255,255,.45)",
    border: "1px solid rgba(255,255,255,.06)",
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "inherit",
  };
}

function confirm_button_style(disabled: boolean): CSSProperties {
  return {
    flex: 2,
    padding: "12px 0",
    fontSize: 13,
    fontWeight: 800,
    borderRadius: 10,
    background: disabled ? "rgba(255,255,255,.04)" : "var(--color-action-sell)",
    color: disabled ? "rgba(255,255,255,.25)" : "#fff",
    border: disabled ? "1px solid rgba(255,255,255,.06)" : "none",
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "inherit",
  };
}
