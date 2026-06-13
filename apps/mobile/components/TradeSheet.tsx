// TradeSheet — buy/sell order entry. RN port of
// apps/web/src/ui/components/TradeDialog.tsx (form -> confirm -> done).
//
// DDD role: UI presentation. The numbers come from `portfolio_api.preview_trade`
// (pure `simulate_trade` in core) and the order is placed via
// `trades_api.execute` — the exact surface the web uses. execute() already
// refreshes the local caches, so the portfolio bar / tab update on their own.

import { useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Slider from "@react-native-community/slider";

import { portfolio_api } from "@fundxi/core/api/portfolio_api";
import { trades_api } from "@fundxi/core/api/trades_api";
import type { TradeMode } from "@fundxi/core/application/trade_service";
import type { Player } from "@fundxi/core/domain/player/player";

import { fmt_eur_from_m, fmt_eur_m, fmt_eur_m_signed, fmt_shares } from "@/lib/format";
import { palette, text } from "@/theme/tokens";

type Kind = "buy" | "sell";
type Phase = "form" | "submitting" | "done";

const PCT_PRESETS = [10, 25, 50, 100];

interface TradeSheetProps {
  visible: boolean;
  player: Player;
  current_price: number;
  initial_kind: Kind;
  on_close: () => void;
  /** Called after a successful execution so the opener can refresh its view. */
  on_done?: () => void;
}

export function TradeSheet({ visible, player, current_price, initial_kind, on_close, on_done }: TradeSheetProps) {
  const [kind, set_kind] = useState<Kind>(initial_kind);
  const [mode, set_mode] = useState<TradeMode>("percentage");
  const [percentage, set_percentage] = useState(10);
  const [shares, set_shares] = useState(0);
  const [phase, set_phase] = useState<Phase>("form");
  const [error, set_error] = useState<string | null>(null);
  const [done_shares, set_done_shares] = useState(0);
  const [done_price, set_done_price] = useState(0);
  const [done_total, set_done_total] = useState(0);

  // Re-seed when reopened in a given mode.
  const [last_kind, set_last_kind] = useState<Kind>(initial_kind);
  if (visible && phase === "form" && last_kind !== initial_kind) {
    set_last_kind(initial_kind);
    set_kind(initial_kind);
  }

  const is_buy = kind === "buy";
  const accent = is_buy ? palette.actionBuy : palette.actionSell;

  const preview = useMemo(
    () => portfolio_api.preview_trade({ player, kind, mode, percentage, shares, current_price }),
    [player, kind, mode, percentage, shares, current_price],
  );

  // Slider ceiling in shares mode, in DISPLAY shares — bounded by BOTH cash
  // (buys) and the player-value cap (max_trade_display_shares). Mirrors the web
  // TradeDialog. `shares` state is the displayed count; preview.shares is the
  // canonical ownership fraction sent to the backend.
  const safe_pps = preview.price_per_share > 0 ? preview.price_per_share : 1;
  const max_affordable = is_buy ? preview.cash_before / safe_pps : Infinity;
  // Buys also can't exceed the margin/leverage headroom (buying power).
  const max_margin = is_buy ? preview.buying_power / safe_pps : Infinity;
  const slider_max = Math.max(1, Math.floor(Math.min(max_affordable, max_margin, preview.max_trade_display_shares)));

  const can_confirm =
    phase === "form" && !preview.insufficient_capital && !preview.exceeds_margin && preview.shares > 0;

  // Switching unit carries the value over instead of resetting to 0.
  const switch_mode = (next: TradeMode) => {
    if (next === mode) return;
    if (next === "shares") set_shares(Math.round(preview.display_shares));
    else set_percentage(Math.min(100, Math.max(1, preview.percentage_of_portfolio)));
    set_mode(next);
  };

  const confirm = async () => {
    if (!can_confirm) return;
    set_phase("submitting");
    set_error(null);
    try {
      await trades_api.execute({ player_id: player.id, kind, shares: preview.shares, price: current_price });
      set_done_shares(preview.display_shares);
      set_done_price(preview.price_per_share);
      set_done_total(preview.amount);
      set_phase("done");
      on_done?.();
    } catch (err) {
      // Surface the server's real reason (e.g. "insufficient buying power…")
      // instead of a generic message — the BFF already puts the detail on the
      // ApiError (see infrastructure/api_client).
      set_error(err instanceof Error && err.message ? err.message : "Order failed. Please try again.");
      set_phase("form");
    }
  };

  const close = () => {
    // Reset for next open.
    set_mode("percentage");
    set_percentage(10);
    set_shares(0);
    set_phase("form");
    set_error(null);
    on_close();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.card} onPress={() => {}}>
          {phase === "done" ? (
            <View style={{ alignItems: "center", gap: 8 }}>
              <Text style={[styles.done_title, { color: accent }]}>{is_buy ? "Bought" : "Sold"}</Text>
              <Text style={styles.done_sub}>
                {fmt_shares(done_shares)} shares of {player.name}
              </Text>
              <View style={[styles.preview, { alignSelf: "stretch" }]}>
                <PreviewRow label="Shares" value={fmt_shares(done_shares)} />
                <PreviewRow label="Price" value={fmt_eur_from_m(done_price)} />
                <PreviewRow label="Total" value={fmt_eur_m(done_total)} color={accent} />
              </View>
              <Pressable style={[styles.confirm, { backgroundColor: accent }]} onPress={close}>
                <Text style={styles.confirm_label}>Done</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.title}>{player.full_name ?? player.name}</Text>
              <Text style={styles.price}>
                Value {fmt_eur_m(current_price)} · {fmt_eur_from_m(preview.price_per_share)}/share
              </Text>

              {/* Buy / Sell */}
              <View style={styles.toggle_row}>
                {(["buy", "sell"] as Kind[]).map(k => {
                  const on = kind === k;
                  const c = k === "buy" ? palette.actionBuy : palette.actionSell;
                  return (
                    <Pressable
                      key={k}
                      style={[styles.toggle, on && { backgroundColor: c, borderColor: c }]}
                      onPress={() => set_kind(k)}
                    >
                      <Text style={[styles.toggle_label, on && { color: "#04140a" }]}>{k === "buy" ? "Buy" : "Sell"}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Mode: percent of portfolio vs exact shares */}
              <View style={styles.mode_row}>
                {(["percentage", "shares"] as TradeMode[]).map(m => {
                  const on = mode === m;
                  return (
                    <Pressable key={m} style={[styles.mode, on && styles.mode_on]} onPress={() => switch_mode(m)}>
                      <Text style={[styles.mode_label, on && styles.mode_label_on]}>
                        {m === "percentage" ? "Percent" : "Shares"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Slider — fine control, with quick presets in percent mode */}
              <View style={styles.slider_head}>
                <Text style={styles.slider_caption}>{mode === "percentage" ? "Amount" : "Shares"}</Text>
                <Text style={styles.slider_value}>{mode === "percentage" ? `${percentage}%` : fmt_shares(shares)}</Text>
              </View>
              {mode === "percentage" ? (
                <Slider
                  style={styles.slider}
                  minimumValue={1}
                  maximumValue={100}
                  step={1}
                  value={percentage}
                  onValueChange={set_percentage}
                  minimumTrackTintColor={accent}
                  maximumTrackTintColor="rgba(255,255,255,0.15)"
                  thumbTintColor={accent}
                />
              ) : (
                <Slider
                  style={styles.slider}
                  minimumValue={0}
                  maximumValue={slider_max}
                  step={1}
                  value={shares}
                  onValueChange={v => set_shares(Math.round(v))}
                  minimumTrackTintColor={accent}
                  maximumTrackTintColor="rgba(255,255,255,0.15)"
                  thumbTintColor={accent}
                />
              )}
              {mode === "percentage" && (
                <View style={styles.pct_row}>
                  {PCT_PRESETS.map(p => {
                    const on = percentage === p;
                    return (
                      <Pressable key={p} style={[styles.pct, on && styles.pct_on]} onPress={() => set_percentage(p)}>
                        <Text style={[styles.pct_label, on && styles.pct_label_on]}>{p === 100 ? "Max" : `${p}%`}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {/* Preview */}
              <View style={styles.preview}>
                <PreviewRow label="Shares" value={fmt_shares(preview.display_shares)} />
                <PreviewRow label="Price / share" value={fmt_eur_from_m(preview.price_per_share)} />
                <PreviewRow label="Amount" value={fmt_eur_m(preview.amount)} />
                <PreviewRow label="Owned after" value={`${Math.round(preview.pct_of_player_after)}% of player`} />
                <PreviewRow label="% of portfolio" value={`${preview.percentage_of_portfolio.toFixed(1)}%`} />
                <PreviewRow label="Cash after" value={fmt_eur_m(preview.cash_after)} />
                {preview.realized_pnl !== 0 && (
                  <PreviewRow
                    label="Realized P&L"
                    value={fmt_eur_m_signed(preview.realized_pnl)}
                    color={preview.realized_pnl >= 0 ? palette.positive : palette.negative}
                  />
                )}
              </View>

              {preview.capped && (
                <Text style={styles.hint}>
                  Capped at the whole player: a position can't exceed 100% of {player.name} ({fmt_eur_m(current_price)} ={" "}
                  {fmt_shares(slider_max)} shares). This is the largest {is_buy ? "position" : "short"} you can take.
                </Text>
              )}
              {preview.insufficient_capital && (
                <Text style={styles.error}>Insufficient cash — short by {fmt_eur_m(preview.shortfall)}.</Text>
              )}
              {preview.exceeds_margin && !preview.insufficient_capital && (
                <Text style={styles.error}>
                  Exceeds buying power — adds more exposure than {fmt_eur_m(preview.buying_power)} allows. Reduce the
                  size.
                </Text>
              )}
              {error && <Text style={styles.error}>{error}</Text>}

              <Pressable
                style={[styles.confirm, { backgroundColor: accent }, !can_confirm && styles.confirm_disabled]}
                onPress={confirm}
                disabled={!can_confirm}
              >
                {phase === "submitting" ? (
                  <ActivityIndicator color="#04140a" />
                ) : (
                  <Text style={styles.confirm_label}>
                    {is_buy ? "Buy" : "Sell"} {fmt_shares(preview.display_shares)} shares
                  </Text>
                )}
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function PreviewRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.preview_row}>
      <Text style={styles.preview_label}>{label}</Text>
      <Text style={[styles.preview_value, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", paddingHorizontal: 20 },
  card: {
    backgroundColor: palette.surfaceDeep,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  title: { color: "#fff", fontSize: 20, fontWeight: "800" },
  price: { color: text.secondary, fontSize: 13, marginTop: -6 },
  toggle_row: { flexDirection: "row", gap: 8 },
  toggle: {
    flex: 1,
    paddingVertical: 11,
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  toggle_label: { color: "#fff", fontSize: 14, fontWeight: "800" },
  pct_row: { flexDirection: "row", gap: 8 },
  pct: {
    flex: 1,
    paddingVertical: 9,
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  pct_on: { backgroundColor: "rgba(255,255,255,0.12)", borderColor: "rgba(255,255,255,0.25)" },
  pct_label: { color: text.secondary, fontSize: 13, fontWeight: "700" },
  pct_label_on: { color: "#fff" },
  mode_row: { flexDirection: "row", gap: 8 },
  mode: {
    flex: 1,
    paddingVertical: 9,
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  mode_on: { backgroundColor: "rgba(255,255,255,0.12)", borderColor: "rgba(255,255,255,0.25)" },
  mode_label: { color: text.secondary, fontSize: 13, fontWeight: "700" },
  mode_label_on: { color: "#fff" },
  slider_head: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: -4 },
  slider_caption: { color: text.tertiary, fontSize: 12, fontWeight: "600" },
  slider_value: { color: "#fff", fontSize: 16, fontWeight: "800" },
  slider: { width: "100%", height: 36 },
  preview: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 10,
    padding: 12,
    gap: 7,
  },
  preview_row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  preview_label: { color: text.tertiary, fontSize: 12, fontWeight: "600" },
  preview_value: { color: "#fff", fontSize: 13, fontWeight: "800" },
  error: { color: palette.negative, fontSize: 13, fontWeight: "600" },
  hint: {
    color: text.secondary,
    fontSize: 12,
    lineHeight: 17,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 8,
    padding: 10,
  },
  confirm: { borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 2 },
  confirm_disabled: { opacity: 0.4 },
  confirm_label: { color: "#04140a", fontSize: 15, fontWeight: "800" },
  done_title: { fontSize: 24, fontWeight: "900", marginTop: 4 },
  done_sub: { color: text.secondary, fontSize: 14, marginBottom: 8 },
});
