import type { PortfolioTotals } from "@/domain/portfolio/portfolio_metrics";
import { fmt_eur_m, fmt_eur_m_signed } from "@/ui/helpers/format";

interface PortfolioBarProps {
  totals: PortfolioTotals;
  holdings_count: number;
  on_click: () => void;
}

export function PortfolioBar({ totals, holdings_count, on_click }: PortfolioBarProps) {
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
            boxShadow: `0 0 6px ${up ? "rgba(55,255,99,.4)" : "rgba(255,40,93,.4)"}`,
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
