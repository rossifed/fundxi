import { useEffect, useMemo, useState } from "react";
import { portfolio_api } from "@fundxi/core/api/portfolio_api";
import { fmt_eur_m, fmt_eur_m_signed, fmt_signed_pct } from "@/ui/helpers/format";
import { useLiveValuations } from "@/ui/hooks/use_live_valuations";
import { useViewport } from "@/ui/hooks/use_viewport";

interface PortfolioBarProps {
  on_click: () => void;
}

/* PortfolioBar — always-on header strip with the live portfolio totals.
 *
 * Live data comes from the shared ``useLiveValuations`` stream (one SSE
 * subscription + one debounced refetch per browser, shared with every
 * other consumer). The bar only recomputes its totals — it never opens
 * a socket or refetches on its own. Trades (local mutations) bump it
 * through ``portfolio_api.subscribe``; holdings are hydrated once. */
export function PortfolioBar({ on_click }: PortfolioBarProps) {
  const { is_mobile } = useViewport();
  const live_valuations = useLiveValuations();
  const [data_version, set_data_version] = useState(0);

  useEffect(() => portfolio_api.subscribe(() => set_data_version(v => v + 1)), []);
  // Hydrate holdings + cash once on mount (valuations are hydrated by
  // the shared live stream; holdings only change on a trade).
  useEffect(() => {
    void portfolio_api.refresh().then(() => set_data_version(v => v + 1));
  }, []);

  // Recompute on a shared-valuations refresh OR a local trade mutation.
  const totals = useMemo(() => portfolio_api.get_totals(), [data_version, live_valuations]);
  const holdings_count = useMemo(
    () => portfolio_api.get_holdings().length,
    [data_version, live_valuations],
  );

  const { total_value, cash, pnl, return_pct } = totals;
  const up = pnl >= 0;
  return (
    <div
      onClick={on_click}
      style={{
        position: "sticky",
        top: 56,
        zIndex: 99,
        height: 36,
        background: "rgba(2,4,6,.85)",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(255,255,255,.04)",
        padding: is_mobile ? "0 14px" : "0 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        cursor: "pointer",
      }}
    >
      {/* Left group shrinks first (value truncates); the right group holds
          priority so P&L is never clipped — mirrors the native PortfolioBar. */}
      <div style={{ display: "flex", alignItems: "center", gap: is_mobile ? 8 : 14, flexShrink: 1, minWidth: 0 }}>
        <div
          style={{
            width: 5,
            height: 5,
            borderRadius: 3,
            flexShrink: 0,
            background: up ? "var(--color-positive)" : "var(--color-negative)",
            boxShadow: `0 0 6px ${up ? "color-mix(in srgb, var(--color-positive) 40%, transparent)" : "color-mix(in srgb, var(--color-negative) 40%, transparent)"}`,
          }}
        />
        {/* The "PORTFOLIO" word is desktop-only chrome; on a phone the dot +
            value already read as the portfolio strip (native drops it too). */}
        {!is_mobile && (
          <span style={{ fontSize: 11, color: "rgba(255,255,255,.35)", fontWeight: 600, letterSpacing: 0.3 }}>
            PORTFOLIO
          </span>
        )}
        <span className="mono" style={{ fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
          {fmt_eur_m(total_value)}
        </span>
        <span
          className="mono"
          style={{
            fontSize: 12,
            fontWeight: 700,
            flexShrink: 0,
            color: up ? "var(--color-positive)" : "var(--color-negative)",
          }}
        >
          {fmt_signed_pct(return_pct, 1)}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: is_mobile ? 12 : 14, flexShrink: 0, paddingLeft: 10 }}>
        <Stat label="Cash" value={fmt_eur_m(cash)} />
        {/* Shortened to "Pos" on phone to save width, matching native. */}
        <Stat label={is_mobile ? "Pos" : "Holdings"} value={String(holdings_count)} />
        <Stat
          label="P&L"
          value={fmt_eur_m_signed(pnl)}
          color={up ? "var(--color-positive)" : "var(--color-negative)"}
        />
        {!is_mobile && <span style={{ fontSize: 11, color: "rgba(255,255,255,.2)" }}>◈</span>}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 5 }}>
      <span style={{ fontSize: 10, color: "rgba(255,255,255,.35)", fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase" }}>
        {label}
      </span>
      <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: color ?? "#fff" }}>
        {value}
      </span>
    </span>
  );
}
