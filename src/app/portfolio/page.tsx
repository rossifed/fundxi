"use client";
import { useState } from "react";
import Link from "next/link";
import { myPortfolio, getPlayer, formatValue, pnlColor, pnlSign, players } from "@/data/mock";
import AreaChart from "@/components/AreaChart";

function DonutChart({ data, size = 140 }: { data: { label: string; value: number; color: string }[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = size / 2 - 8;
  const cx = size / 2;
  const cy = size / 2;
  let cumAngle = -Math.PI / 2;

  const slices = data.map((d) => {
    const angle = (d.value / total) * 2 * Math.PI;
    const startX = cx + r * Math.cos(cumAngle);
    const startY = cy + r * Math.sin(cumAngle);
    cumAngle += angle;
    const endX = cx + r * Math.cos(cumAngle);
    const endY = cy + r * Math.sin(cumAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    const path = `M ${cx} ${cy} L ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY} Z`;
    return { ...d, path };
  });

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size}>
        {slices.map((s, i) => (
          <path key={i} d={s.path} fill={s.color} opacity="0.85" stroke="var(--card)" strokeWidth="2" />
        ))}
        <circle cx={cx} cy={cy} r={r * 0.55} fill="var(--card)" />
      </svg>
      <div className="flex flex-col gap-1 text-xs">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-foreground/60">{d.label}</span>
            <span className="font-semibold">{((d.value / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PositionMap({ playerIds }: { playerIds: string[] }) {
  const posCoords: Record<string, { x: number; y: number }> = {
    GK: { x: 50, y: 90 }, LB: { x: 15, y: 70 }, CB: { x: 38, y: 75 }, RB: { x: 85, y: 70 },
    CDM: { x: 50, y: 55 }, CM: { x: 35, y: 45 }, CAM: { x: 50, y: 35 },
    LW: { x: 18, y: 22 }, RW: { x: 82, y: 22 }, ST: { x: 50, y: 12 },
  };
  // Offset duplicate positions
  const usedPos: Record<string, number> = {};
  const holdPlayers = playerIds.map(id => getPlayer(id)!).filter(Boolean);

  return (
    <div className="pitch relative mx-auto" style={{ maxHeight: 300 }}>
      <div className="pitch-center-circle" />
      <div className="pitch-center-line" />
      <div className="pitch-box-top" />
      <div className="pitch-box-bottom" />
      {holdPlayers.map((p) => {
        const base = posCoords[p.position] || { x: 50, y: 50 };
        const count = (usedPos[p.position] || 0);
        usedPos[p.position] = count + 1;
        const offsetX = count * 15 * (count % 2 === 0 ? 1 : -1);
        return (
          <Link
            key={p.id}
            href={`/player/${p.id}`}
            className="absolute flex flex-col items-center -translate-x-1/2 -translate-y-1/2 group"
            style={{ left: `${base.x + offsetX}%`, top: `${base.y}%` }}
          >
            <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-white shadow-lg group-hover:scale-110 transition-transform">
              {p.number}
            </div>
            <span className="mt-0.5 text-[9px] font-semibold text-white/80 drop-shadow">{p.name.split(" ").pop()}</span>
          </Link>
        );
      })}
    </div>
  );
}

export default function PortfolioPage() {
  const [period, setPeriod] = useState<"day" | "all">("all");

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

  // Portfolio value history (aggregate of all holdings)
  const portfolioHistory = Array.from({ length: 10 }, (_, i) => {
    return holdings.reduce((sum, h) => {
      return sum + (h.player.valueHistory[i] || h.player.value) * h.quantity;
    }, 0);
  });

  // Day performance = last 3 data points, All = full history
  const chartData = period === "day" ? portfolioHistory.slice(-3) : portfolioHistory;

  // Team breakdown
  const teamMap = new Map<string, number>();
  holdings.forEach(h => {
    const team = h.player.team;
    teamMap.set(team, (teamMap.get(team) || 0) + h.currentValue);
  });
  const teamColors: Record<string, string> = {
    "Paris Saint-Germain": "#004170", "Real Madrid": "#FEBE10", "FC Barcelona": "#A50044",
    "Liverpool FC": "#C8102E", "Manchester City": "#6CABDD", "Bayern Munich": "#DC052D",
  };
  const teamBreakdown = Array.from(teamMap.entries()).map(([label, value]) => ({
    label, value, color: teamColors[label] || "#3b82f6",
  }));

  // Position breakdown
  const posMap = new Map<string, number>();
  holdings.forEach(h => {
    const pos = h.player.position;
    posMap.set(pos, (posMap.get(pos) || 0) + h.currentValue);
  });
  const posColors: Record<string, string> = {
    GK: "#6366f1", CB: "#8b5cf6", LB: "#a78bfa", RB: "#c4b5fd",
    CDM: "#10b981", CM: "#34d399", CAM: "#6ee7b7",
    LW: "#f59e0b", RW: "#fbbf24", ST: "#ef4444",
  };
  const posBreakdown = Array.from(posMap.entries()).map(([label, value]) => ({
    label, value, color: posColors[label] || "#3b82f6",
  }));

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

      {/* Performance chart */}
      <div className="mb-6 rounded-2xl border border-border bg-card p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground/50">Performance</h2>
          <div className="flex gap-1">
            <button
              onClick={() => setPeriod("day")}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${period === "day" ? "bg-accent text-white" : "bg-foreground/10 text-foreground/50 hover:bg-foreground/20"}`}
            >
              Day
            </button>
            <button
              onClick={() => setPeriod("all")}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${period === "all" ? "bg-accent text-white" : "bg-foreground/10 text-foreground/50 hover:bg-foreground/20"}`}
            >
              All
            </button>
          </div>
        </div>
        <div className="rounded-xl bg-background p-4">
          <AreaChart data={chartData} positive={totalPnl >= 0} height={200} showLabels />
        </div>
      </div>

      {/* Breakdowns */}
      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 text-sm font-semibold text-foreground/50">By Team</h2>
          <DonutChart data={teamBreakdown} />
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 text-sm font-semibold text-foreground/50">By Position</h2>
          <DonutChart data={posBreakdown} />
        </div>
      </div>

      {/* Position map */}
      <div className="mb-6 rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground/50">Your Players on the Pitch</h2>
        <PositionMap playerIds={myPortfolio.map(h => h.playerId)} />
      </div>

      {/* Holdings */}
      <h2 className="mb-3 text-sm font-semibold text-foreground/50">Holdings</h2>
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
              <div className="w-24 h-8 opacity-60">
                <AreaChart data={h.player.valueHistory} positive={positive} height={32} mini />
              </div>
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
