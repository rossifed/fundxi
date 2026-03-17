"use client";
import Link from "next/link";
import { myPortfolio, getPlayer, formatValue, pnlColor, pnlSign } from "@/data/mock";
import Sparkline from "@/components/Sparkline";

export default function PortfolioPage() {
  const holdings = myPortfolio.map((h) => {
    const player = getPlayer(h.playerId)!;
    const currentValue = player.value * h.quantity;
    const costBasis = h.avgBuyPrice * h.quantity;
    const pnl = currentValue - costBasis;
    const pnlPct = (pnl / costBasis) * 100;
    return { ...h, player, currentValue, costBasis, pnl, pnlPct };
  });

  const totalValue = holdings.reduce((s, h) => s + h.currentValue, 0);
  const totalCost = holdings.reduce((s, h) => s + h.costBasis, 0);
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = (totalPnl / totalCost) * 100;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Portfolio</h1>
        <Link
          href="/portfolio/build"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
        >
          Edit Portfolio
        </Link>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-sm text-foreground/50">Total Value</div>
          <div className="text-2xl font-bold">{formatValue(totalValue)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-sm text-foreground/50">Total P&L</div>
          <div className={`text-2xl font-bold ${pnlColor(totalPnl)}`}>
            {pnlSign(totalPnl)}{formatValue(Math.abs(totalPnl))}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-sm text-foreground/50">Return</div>
          <div className={`text-2xl font-bold ${pnlColor(totalPnlPct)}`}>
            {pnlSign(totalPnlPct)}{totalPnlPct.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Holdings */}
      <div className="flex flex-col gap-3">
        {holdings.map((h) => {
          const positive = h.pnl >= 0;
          return (
            <Link
              key={h.playerId}
              href={`/player/${h.playerId}`}
              className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-card-hover"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-lg font-bold text-accent">
                {h.player.number}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{h.player.name}</div>
                <div className="text-sm text-foreground/50">
                  {h.quantity}x @ {formatValue(h.avgBuyPrice)} avg
                </div>
              </div>
              <Sparkline data={h.player.valueHistory} positive={positive} />
              <div className="text-right">
                <div className="font-semibold">{formatValue(h.currentValue)}</div>
                <div className={`text-sm ${pnlColor(h.pnl)}`}>
                  {pnlSign(h.pnl)}{h.pnl.toFixed(1)}M ({pnlSign(h.pnlPct)}{h.pnlPct.toFixed(1)}%)
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
