// PortfolioBar — RN port of apps/web/src/ui/shell/PortfolioBar.tsx.
//
// Always-on strip with the live portfolio totals, rendered inside every tab's
// header (see app/(tabs)/_layout.tsx) so the P&L is glanceable from any screen
// — the web parity for the sticky desktop strip. Live data comes from the
// shared prices stream (one SSE subscription, fanned out); the bar only
// recomputes totals. Trades bump it through portfolio_api.subscribe.

import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { portfolio_api } from "@fundxi/core/api/portfolio_api";
import { valuations_api } from "@fundxi/core/api/valuations_api";

import { useLiveRefetch, usePricesLiveVersion } from "@/components/live";
import { fmt_eur_m, fmt_eur_m_signed } from "@/lib/format";
import { mono, palette, text } from "@/theme/tokens";

export function PortfolioBar() {
  const [data_version, set_data_version] = useState(0);
  // The portfolio is per-user and auth-gated; mobile has no auth yet (bearer
  // token deferred — see api_client.ts / MOBILE-MIGRATION-PLAN R7), so
  // /api/portfolio returns 401. Until that lands we hide the bar rather than
  // show a misleading €0 — no fabricated data (CLAUDE.md data-sourcing rule).
  const [ready, set_ready] = useState(false);

  useEffect(() => portfolio_api.subscribe(() => set_data_version(v => v + 1)), []);
  useEffect(() => {
    let mounted = true;
    portfolio_api
      .refresh()
      .then(() => {
        if (!mounted) return;
        set_ready(true);
        set_data_version(v => v + 1);
      })
      .catch(() => mounted && set_ready(false));
    return () => {
      mounted = false;
    };
  }, []);
  // Recompute on a shared-valuations refresh (price tick) or a local trade.
  useLiveRefetch(usePricesLiveVersion(), () => {
    void valuations_api.refresh().then(() => set_data_version(v => v + 1)).catch(() => {});
  });

  const totals = useMemo(() => portfolio_api.get_totals(), [data_version]);
  const holdings_count = useMemo(() => portfolio_api.get_holdings().length, [data_version]);

  if (!ready) return null;

  const { total_value, cash, pnl, return_pct } = totals;
  const up = pnl >= 0;
  const accent = up ? palette.positive : palette.negative;

  return (
    <Pressable onPress={() => router.navigate("/portfolio")} style={styles.bar}>
      <View style={styles.group}>
        <View style={[styles.dot, { backgroundColor: accent }]} />
        <Text style={styles.label}>PORTFOLIO</Text>
        <Text style={styles.value}>{fmt_eur_m(total_value)}</Text>
        <Text style={[styles.return, { color: accent }]}>
          {return_pct >= 0 ? "+" : ""}
          {return_pct.toFixed(1)}%
        </Text>
      </View>
      <View style={styles.group}>
        <Stat label="Cash" value={fmt_eur_m(cash)} />
        <Stat label="Hold" value={String(holdings_count)} />
        <Stat label="P&L" value={fmt_eur_m_signed(pnl)} color={accent} />
      </View>
    </Pressable>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.stat_label}>{label}</Text>
      <Text style={[styles.stat_value, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    // Translucent so the ambient gradient shows through (web bar uses
    // rgba(2,4,6,.85) + blur); RN has no backdrop blur, so a dark tint.
    backgroundColor: "rgba(2,4,6,0.5)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  group: { flexDirection: "row", alignItems: "center", gap: 10 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  label: { fontSize: 10, color: text.tertiary, fontWeight: "600", letterSpacing: 0.3 },
  value: { fontFamily: mono, fontSize: 13, fontWeight: "800", color: "#fff" },
  return: { fontFamily: mono, fontSize: 12, fontWeight: "700" },
  stat: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  stat_label: { fontSize: 9, color: text.tertiary, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase" },
  stat_value: { fontFamily: mono, fontSize: 12, fontWeight: "700", color: "#fff" },
});
