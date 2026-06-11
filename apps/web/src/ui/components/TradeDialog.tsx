import { useEffect, useState } from "react";
import { teams_api } from "@fundxi/core/api/teams_api";
import { trades_api } from "@fundxi/core/api/trades_api";
import { valuations_api } from "@fundxi/core/api/valuations_api";
import { simulate_trade, type TradeMode } from "@fundxi/core/application/trade_service";
import type { Player } from "@fundxi/core/domain/player/player";
import { PlayerChip } from "@/ui/components/PlayerChip";
import { Sheet } from "@/ui/components/Sheet";
import { fmt_eur_m, fmt_shares } from "@/ui/helpers/format";

type TradeKindLocal = "buy" | "sell";

interface ConfirmedTrade {
  kind: TradeKindLocal;
  shares: number;
  amount: number;
  percentage: number;
}

interface TradeDialogProps {
  open: boolean;
  player: Player;
  initial_kind: TradeKindLocal;
  on_close: () => void;
  go_portfolio?: () => void;
  // Optional snapshot overrides — used when caller already holds price data
  // (e.g. MatchView passing a MatchPlayer's value for an inline-only sub).
  current_price?: number;
  // % change to display next to the price (caller picks the relevant window;
  // defaults to the player's since-inception change).
  change_pct?: number;
}

export function TradeDialog({
  open,
  player,
  initial_kind,
  on_close,
  go_portfolio,
  current_price: current_price_override,
  change_pct: change_pct_override,
}: TradeDialogProps) {
  const team = teams_api.get(player.team_id);
  const valuation = valuations_api.get_for_player(player.id);
  const current_price = current_price_override ?? valuation?.current_price ?? 0;
  const change_pct = change_pct_override ?? valuation?.change_since_inception ?? 0;

  const [kind, set_kind] = useState<TradeKindLocal>(initial_kind);
  const [mode, set_mode] = useState<TradeMode>("percentage");
  const [percentage, set_percentage] = useState(10);
  const [custom_shares, set_custom_shares] = useState(0);
  const [confirmed, set_confirmed] = useState<ConfirmedTrade | null>(null);
  const [submitting, set_submitting] = useState(false);
  const [error, set_error] = useState<string | null>(null);

  // Reset state every time the dialog re-opens.
  useEffect(() => {
    if (open) {
      set_kind(initial_kind);
      set_mode("percentage");
      set_percentage(10);
      set_custom_shares(0);
      set_confirmed(null);
      set_submitting(false);
      set_error(null);
    }
  }, [open, initial_kind]);

  if (!open) return null;

  const is_buy = kind === "buy";
  const is_up = change_pct >= 0;

  // ── Confirmed view ──
  if (confirmed) {
    const c = confirmed;
    const c_is_buy = c.kind === "buy";
    return (
      <Sheet open={true} on_close={on_close} max_width={460}>
        <div style={{ padding: "32px 24px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 8 }}>{c_is_buy ? "✅" : "🔴"}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: c_is_buy ? "var(--color-positive)" : "var(--color-negative)", marginBottom: 4 }}>
            {c_is_buy ? "Bought" : "Sold"}!
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.55)", marginBottom: 22 }}>
            {c.shares} shares of {player.name}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 8,
              marginBottom: 22,
            }}
          >
            <SummaryCell label="Shares" value={String(c.shares)} />
            <SummaryCell label="Amount" value={`€${c.amount.toLocaleString()}`} />
            <SummaryCell
              label="Position"
              value={c_is_buy ? "📈 Long" : "📉 Short"}
              color={c_is_buy ? "var(--color-positive)" : "var(--color-negative)"}
              mono={false}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={on_close}
              style={{
                flex: 2,
                padding: "12px 0",
                fontSize: 13,
                fontWeight: 800,
                borderRadius: 10,
                background: "rgba(255,255,255,.08)",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Done ✓
            </button>
            <button
              onClick={() => {
                on_close();
                go_portfolio?.();
              }}
              style={{
                flex: 1,
                padding: "12px 0",
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 10,
                background: "rgba(255,255,255,.04)",
                color: "rgba(255,255,255,.5)",
                border: "1px solid rgba(255,255,255,.06)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Portfolio →
            </button>
          </div>
        </div>
      </Sheet>
    );
  }

  // ── Trade form view ──
  const preview = simulate_trade({
    player,
    kind,
    mode,
    percentage,
    shares: custom_shares,
    current_price,
  });

  const final_shares = preview.shares;
  const final_amount = preview.amount;
  const final_pct = preview.percentage_of_portfolio;
  const is_short = preview.is_short;
  const short_qty = preview.short_quantity;
  const held_shares = preview.held_shares;

  const safe_price = current_price > 0 ? current_price : 1;
  const max_shares = is_buy
    ? Math.floor(preview.cash_before / safe_price)
    : Math.max(held_shares, Math.floor(preview.cash_before / safe_price));
  const slider_max = Math.max(max_shares, 1);

  const can_confirm = !preview.insufficient_capital && final_shares > 0;

  return (
    <Sheet
      open={true}
      on_close={on_close}
      max_width={480}
      footer={
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={on_close}
            style={{
              flex: 1,
              padding: "12px 0",
              fontSize: 13,
              fontWeight: 700,
              borderRadius: 10,
              background: "rgba(255,255,255,.04)",
              color: "rgba(255,255,255,.45)",
              border: "1px solid rgba(255,255,255,.06)",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (!can_confirm || submitting) return;
              set_submitting(true);
              set_error(null);
              trades_api
                .execute({
                  player_id: player.id,
                  kind,
                  shares: final_shares,
                  price: current_price,
                })
                .then(() => {
                  set_confirmed({
                    kind,
                    shares: final_shares,
                    amount: final_amount,
                    percentage: final_pct,
                  });
                })
                .catch((err: unknown) => {
                  set_error(err instanceof Error ? err.message : String(err));
                })
                .finally(() => set_submitting(false));
            }}
            disabled={!can_confirm || submitting}
            style={{
              flex: 2,
              padding: "12px 0",
              fontSize: 13,
              fontWeight: 800,
              borderRadius: 10,
              background: !can_confirm
                ? "rgba(255,255,255,.04)"
                : is_buy
                  ? "linear-gradient(135deg,var(--color-action-buy),color-mix(in srgb, var(--color-action-buy), black 28%))"
                  : "linear-gradient(135deg,var(--color-action-sell),color-mix(in srgb, var(--color-action-sell), black 18%))",
              color: !can_confirm ? "rgba(255,255,255,.25)" : "#fff",
              border: !can_confirm ? "1px solid rgba(255,255,255,.06)" : "none",
              cursor: !can_confirm ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              boxShadow: !can_confirm
                ? "none"
                : is_buy
                  ? "0 4px 16px color-mix(in srgb, var(--color-positive) 25%, transparent)"
                  : "0 4px 16px color-mix(in srgb, var(--color-negative) 25%, transparent)",
            }}
          >
            Confirm {is_buy ? "Buy" : "Sell"}
          </button>
        </div>
      }
    >
      <div style={{ padding: "8px 20px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Player strip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 12px",
            background: "rgba(255,255,255,.025)",
            border: "1px solid rgba(255,255,255,.05)",
            borderRadius: 10,
          }}
        >
          <PlayerChip jersey_number={player.jersey_number} team_color={team?.color ?? "#666"} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>{player.name}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", marginTop: 2 }}>
              {team?.name ?? "—"} · #{player.jersey_number}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="mono" style={{ fontSize: 14, fontWeight: 800 }}>€{current_price}M</div>
            <div className="mono" style={{ fontSize: 11, fontWeight: 700, color: is_up ? "var(--color-positive)" : "var(--color-negative)" }}>
              {is_up ? "+" : ""}{change_pct}%
            </div>
          </div>
        </div>

        {/* Buy/Sell tabs */}
        <div style={{ display: "flex", background: "rgba(255,255,255,.03)", borderRadius: 10, padding: 3 }}>
          {([
            { k: "buy" as TradeKindLocal, label: "Buy", color: "var(--color-action-buy)" },
            { k: "sell" as TradeKindLocal, label: "Sell", color: "var(--color-action-sell)" },
          ]).map(t => (
            <button
              key={t.k}
              onClick={() => set_kind(t.k)}
              style={{
                flex: 1,
                padding: "10px 0",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 800,
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
                background:
                  kind === t.k
                    ? t.k === "buy"
                      ? "var(--color-action-buy)"
                      : "var(--color-action-sell)"
                    : "transparent",
                color: kind === t.k ? "#fff" : "rgba(255,255,255,.35)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Cash / holding strip */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0 4px",
            fontSize: 11,
          }}
        >
          <span style={{ color: "rgba(255,255,255,.4)" }}>
            CASH <span className="mono" style={{ color: "#fff", fontWeight: 700, marginLeft: 6 }}>{fmt_eur_m(preview.cash_before)}</span>
          </span>
          {held_shares > 0 && (
            <span style={{ color: "rgba(255,255,255,.4)" }}>
              HOLDING <span className="mono" style={{ color: "#fff", fontWeight: 700, marginLeft: 6 }}>{fmt_shares(held_shares)} shares</span>
            </span>
          )}
        </div>

        {/* Mode toggle */}
        <div style={{ display: "flex", background: "rgba(255,255,255,.03)", borderRadius: 8, padding: 2 }}>
          {([
            { k: "percentage" as TradeMode, label: "% Portfolio" },
            { k: "shares" as TradeMode, label: "Shares" },
          ]).map(m => (
            <button
              key={m.k}
              onClick={() => set_mode(m.k)}
              style={{
                flex: 1,
                padding: "8px 0",
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
                background: mode === m.k ? "rgba(255,255,255,.06)" : "transparent",
                color: mode === m.k ? "#fff" : "rgba(255,255,255,.3)",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Big value */}
        <div style={{ textAlign: "center" }}>
          <div className="mono" style={{ fontSize: 32, fontWeight: 800, lineHeight: 1 }}>
            {mode === "percentage" ? (
              <>
                {percentage}
                <span style={{ fontSize: 18, color: "rgba(255,255,255,.3)" }}>%</span>
              </>
            ) : (
              <>
                {custom_shares} <span style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,.3)" }}>shares</span>
              </>
            )}
          </div>
        </div>

        {/* Shortcuts */}
        <div style={{ display: "flex", justifyContent: "center", gap: 4 }}>
          {mode === "percentage"
            ? [10, 25, 50, 75, 100].map(v => (
                <button
                  key={v}
                  onClick={() => set_percentage(v)}
                  style={{
                    fontSize: 12,
                    fontWeight: percentage === v ? 700 : 500,
                    color: percentage === v ? "#fff" : "rgba(255,255,255,.4)",
                    cursor: "pointer",
                    padding: "6px 12px",
                    borderRadius: 6,
                    background: percentage === v ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.025)",
                    border: "none",
                    fontFamily: "inherit",
                  }}
                >
                  {v}%
                </button>
              ))
            : (() => {
                const max = is_buy
                  ? Math.floor(preview.cash_before / safe_price)
                  : Math.max(held_shares, Math.floor(preview.cash_before / safe_price));
                const vals =
                  !is_buy && held_shares > 0
                    ? [
                        Math.round(held_shares * 0.25),
                        Math.round(held_shares * 0.5),
                        Math.round(held_shares * 0.75),
                        held_shares,
                      ]
                    : [Math.round(max * 0.1), Math.round(max * 0.25), Math.round(max * 0.5), max];
                return vals.map(v => (
                  <button
                    key={v}
                    onClick={() => set_custom_shares(v)}
                    style={{
                      fontSize: 12,
                      fontWeight: custom_shares === v ? 700 : 500,
                      color: custom_shares === v ? "#fff" : "rgba(255,255,255,.4)",
                      cursor: "pointer",
                      padding: "6px 12px",
                      borderRadius: 6,
                      background: custom_shares === v ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.025)",
                      border: "none",
                      fontFamily: "inherit",
                    }}
                  >
                    {v}
                  </button>
                ));
              })()}
        </div>

        {/* Slider */}
        {mode === "percentage" ? (
          <div
            style={{
              background: "rgba(255,255,255,.025)",
              border: "1px solid rgba(255,255,255,.05)",
              borderRadius: 10,
              padding: "12px 14px",
            }}
          >
            <input
              type="range"
              min={1}
              max={100}
              step={1}
              value={percentage}
              onChange={e => set_percentage(parseInt(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>
        ) : (
          <div
            style={{
              background: "rgba(255,255,255,.025)",
              border: "1px solid rgba(255,255,255,.05)",
              borderRadius: 10,
              padding: "12px 14px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={() => set_custom_shares(Math.max(0, Math.round((custom_shares - 0.1) * 10) / 10))}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background: "rgba(255,255,255,.06)",
                  border: "1px solid rgba(255,255,255,.08)",
                  color: "#fff",
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  flexShrink: 0,
                }}
              >
                −
              </button>
              <input
                type="range"
                min={0}
                max={slider_max}
                step={0.1}
                value={custom_shares}
                onChange={e => set_custom_shares(Math.round(parseFloat(e.target.value) * 10) / 10)}
                style={{ flex: 1 }}
              />
              <button
                onClick={() => set_custom_shares(Math.min(slider_max, Math.round((custom_shares + 0.1) * 10) / 10))}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background: "rgba(255,255,255,.06)",
                  border: "1px solid rgba(255,255,255,.08)",
                  color: "#fff",
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  flexShrink: 0,
                }}
              >
                +
              </button>
            </div>
          </div>
        )}

        {/* Trade Preview (Summary + Impact unified) */}
        <div
          style={{
            background: "rgba(255,255,255,.025)",
            border: "1px solid rgba(255,255,255,.05)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "10px 14px 8px",
              borderBottom: "1px solid rgba(255,255,255,.04)",
              fontSize: 11,
              fontWeight: 700,
              color: "rgba(255,255,255,.55)",
              letterSpacing: 0.5,
              textTransform: "uppercase",
            }}
          >
            Trade preview
          </div>
          <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 5 }}>
            <PreviewRow label="Shares" value={`${fmt_shares(final_shares)} @ €${current_price}M`} />
            <PreviewRow
              label="Total"
              value={fmt_eur_m(final_amount)}
              accent={is_buy ? "var(--color-positive)" : "var(--color-negative)"}
              bold
            />
            <PreviewRow
              label="Position"
              before={`${fmt_shares(held_shares)} shares`}
              after={`${fmt_shares(preview.shares_after)} shares`}
              accent={is_buy ? "var(--color-positive)" : "var(--color-negative)"}
            />
            <PreviewRow
              label="Cash"
              before={fmt_eur_m(preview.cash_before)}
              after={fmt_eur_m(preview.cash_after)}
              accent={is_buy ? "var(--color-negative)" : "var(--color-positive)"}
              warning={preview.cash_after < 0}
            />
            <PreviewRow
              label="Type"
              value={is_buy ? "📈 Long" : is_short ? `📉 Short (${short_qty} naked)` : "Close position"}
              accent={is_buy ? "var(--color-positive)" : is_short ? "rgba(255,255,255,.5)" : "var(--color-negative)"}
            />
          </div>
        </div>

        {/* Warnings */}
        {preview.insufficient_capital && (
          <div
            style={{
              background: "color-mix(in srgb, var(--color-negative) 8%, transparent)",
              border: "1px solid color-mix(in srgb, var(--color-negative) 25%, transparent)",
              borderRadius: 8,
              padding: "10px 14px",
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
            }}
          >
            <span style={{ fontSize: 16, flexShrink: 0 }}>⛔</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,.7)", lineHeight: 1.45 }}>
              <strong style={{ color: "var(--color-negative)" }}>Insufficient capital.</strong> You need{" "}
              <span className="mono" style={{ fontWeight: 700 }}>€{preview.shortfall.toLocaleString()}</span> more.
              You have <span className="mono">€{preview.cash_before.toLocaleString()}</span> available.
            </span>
          </div>
        )}
        {is_short && (
          <div
            style={{
              background: "color-mix(in srgb, var(--color-card-yellow) 8%, transparent)",
              border: "1px solid color-mix(in srgb, var(--color-card-yellow) 25%, transparent)",
              borderRadius: 8,
              padding: "10px 14px",
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
            }}
          >
            <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,.7)", lineHeight: 1.45 }}>
              Selling {fmt_shares(final_shares)} closes your {fmt_shares(held_shares)} shares and opens a short of {fmt_shares(short_qty)}.
            </span>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function PreviewRow({
  label,
  value,
  before,
  after,
  accent,
  bold,
  warning,
}: {
  label: string;
  value?: string;
  before?: string;
  after?: string;
  accent?: string;
  bold?: boolean;
  warning?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: 12,
      }}
    >
      <span style={{ color: "rgba(255,255,255,.4)" }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {before !== undefined && after !== undefined ? (
          <>
            <span className="mono" style={{ color: "rgba(255,255,255,.5)" }}>{before}</span>
            <span style={{ color: "rgba(255,255,255,.2)", fontSize: 11 }}>→</span>
            <span
              className="mono"
              style={{
                fontWeight: 700,
                color: warning ? "var(--color-negative)" : accent ?? "#fff",
              }}
            >
              {after}
            </span>
          </>
        ) : (
          <span
            className="mono"
            style={{
              fontWeight: bold ? 800 : 700,
              fontSize: bold ? 14 : 12,
              color: accent ?? "#fff",
            }}
          >
            {value}
          </span>
        )}
      </span>
    </div>
  );
}

function SummaryCell({
  label,
  value,
  color,
  mono = true,
}: {
  label: string;
  value: string;
  color?: string;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,.025)",
        border: "1px solid rgba(255,255,255,.05)",
        borderRadius: 8,
        padding: "10px 8px",
      }}
    >
      <div style={{ fontSize: 9, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>
        {label}
      </div>
      <div className={mono ? "mono" : ""} style={{ fontSize: 13, fontWeight: 800, color: color ?? "#fff", marginTop: 3 }}>
        {value}
      </div>
    </div>
  );
}
