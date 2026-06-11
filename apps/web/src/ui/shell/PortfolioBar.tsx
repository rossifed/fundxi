import { useEffect, useMemo, useState } from "react";
import { portfolio_api } from "@fundxi/core/api/portfolio_api";
import { fmt_eur_m, fmt_eur_m_signed } from "@/ui/helpers/format";
import { useLiveValuations } from "@/ui/hooks/use_live_valuations";

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
        padding: "0 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            width: 5,
            height: 5,
            borderRadius: 3,
            background: up ? "var(--color-positive)" : "var(--color-negative)",
            boxShadow: `0 0 6px ${up ? "color-mix(in srgb, var(--color-positive) 40%, transparent)" : "color-mix(in srgb, var(--color-negative) 40%, transparent)"}`,
          }}
        />
        <span style={{ fontSize: 11, color: "rgba(255,255,255,.35)", fontWeight: 600, letterSpacing: 0.3 }}>
          PORTFOLIO
        </span>
        <span className="mono" style={{ fontSize: 13, fontWeight: 800 }}>
          {fmt_eur_m(total_value)}
        </span>
        <span
          className="mono"
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: up ? "var(--color-positive)" : "var(--color-negative)",
          }}
        >
          {return_pct >= 0 ? "+" : ""}
          {return_pct.toFixed(1)}%
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Stat label="Cash" value={fmt_eur_m(cash)} />
        <Stat label="Holdings" value={String(holdings_count)} />
        <Stat
          label="P&L"
          value={fmt_eur_m_signed(pnl)}
          color={up ? "var(--color-positive)" : "var(--color-negative)"}
        />
        <span style={{ fontSize: 11, color: "rgba(255,255,255,.2)" }}>◈</span>
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
