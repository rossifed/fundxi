import type { PortfolioTotals } from "@/domain/portfolio/portfolio_metrics";

interface PortfolioBarProps {
  totals: PortfolioTotals;
  on_click: () => void;
}

export function PortfolioBar({ totals, on_click }: PortfolioBarProps) {
  const { total_value, pnl, return_pct } = totals;
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
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 5,
            height: 5,
            borderRadius: 3,
            background: pnl >= 0 ? "#37ff63" : "#ff285d",
            boxShadow: `0 0 6px ${pnl >= 0 ? "rgba(55,255,99,.4)" : "rgba(255,40,93,.4)"}`,
          }}
        />
        <span style={{ fontSize: 11, color: "rgba(255,255,255,.35)", fontWeight: 600, letterSpacing: 0.3 }}>
          PORTFOLIO
        </span>
        <span className="mono" style={{ fontSize: 13, fontWeight: 800 }}>
          €{(total_value / 1000).toFixed(1)}k
        </span>
        <span
          className="mono"
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: return_pct >= 0 ? "#37ff63" : "#ff285d",
          }}
        >
          {return_pct >= 0 ? "+" : ""}
          {return_pct.toFixed(1)}%
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          className="mono"
          style={{
            fontSize: 12,
            color: pnl >= 0 ? "#37ff63" : "#ff285d",
            fontWeight: 600,
          }}
        >
          P&L {pnl >= 0 ? "+" : ""}€{(pnl / 1000).toFixed(1)}k
        </span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,.2)" }}>◈</span>
      </div>
    </div>
  );
}
