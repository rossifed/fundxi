"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getPlayer, formatValue, pnlColor, pnlSign } from "@/data/mock";
import Sparkline from "@/components/Sparkline";

export default function PlayerDetailPage() {
  const { id } = useParams();
  const player = getPlayer(id as string);

  if (!player) {
    return <div className="py-20 text-center text-foreground/50">Player not found</div>;
  }

  const change = player.value - player.previousValue;
  const changePct = (change / player.previousValue) * 100;
  const positive = change >= 0;

  return (
    <div>
      <Link href="/screener" className="mb-4 inline-block text-sm text-accent hover:underline">
        &larr; Back to Screener
      </Link>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main info */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/10 text-2xl font-bold text-accent">
                {player.number}
              </div>
              <div>
                <h1 className="text-2xl font-bold">{player.name}</h1>
                <p className="text-foreground/50">
                  {player.nationality} {player.position} · {player.team} · {player.age} yrs
                </p>
              </div>
            </div>

            {/* Value */}
            <div className="mb-6 flex items-baseline gap-3">
              <span className="text-4xl font-bold">{formatValue(player.value)}</span>
              <span className={`text-lg ${pnlColor(change)}`}>
                {pnlSign(change)}{change.toFixed(1)}M ({pnlSign(changePct)}{changePct.toFixed(1)}%)
              </span>
            </div>

            {/* Chart placeholder */}
            <div className="mb-6">
              <h3 className="mb-2 text-sm font-semibold text-foreground/50">Value History</h3>
              <div className="flex h-40 items-end gap-1 rounded-lg bg-background p-4">
                {player.valueHistory.map((v, i) => {
                  const max = Math.max(...player.valueHistory);
                  const min = Math.min(...player.valueHistory);
                  const range = max - min || 1;
                  const height = ((v - min) / range) * 100;
                  return (
                    <div
                      key={i}
                      className="flex-1 rounded-t"
                      style={{
                        height: `${height}%`,
                        minHeight: "4px",
                        backgroundColor: positive ? "var(--green)" : "var(--red)",
                        opacity: 0.4 + (i / player.valueHistory.length) * 0.6,
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4 text-center">
              <div className="rounded-lg bg-background p-3">
                <div className="text-2xl font-bold">{player.stats.goals}</div>
                <div className="text-xs text-foreground/40">Goals</div>
              </div>
              <div className="rounded-lg bg-background p-3">
                <div className="text-2xl font-bold">{player.stats.assists}</div>
                <div className="text-xs text-foreground/40">Assists</div>
              </div>
              <div className="rounded-lg bg-background p-3">
                <div className="text-2xl font-bold">{player.stats.matches}</div>
                <div className="text-xs text-foreground/40">Matches</div>
              </div>
              <div className="rounded-lg bg-background p-3">
                <div className="text-2xl font-bold">{player.stats.rating}</div>
                <div className="text-xs text-foreground/40">Rating</div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar: trade */}
        <div>
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-4 text-lg font-semibold">Trade</h2>
            <div className="mb-4">
              <label className="mb-1 block text-sm text-foreground/50">Quantity</label>
              <input
                type="number"
                defaultValue={1}
                min={1}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground focus:border-accent focus:outline-none"
              />
            </div>
            <div className="mb-4 flex justify-between text-sm">
              <span className="text-foreground/50">Est. Cost</span>
              <span className="font-semibold">{formatValue(player.value)}</span>
            </div>
            <div className="flex gap-2">
              <button className="flex-1 rounded-lg bg-green py-2.5 font-semibold text-white transition-opacity hover:opacity-80">
                Buy
              </button>
              <button className="flex-1 rounded-lg bg-red py-2.5 font-semibold text-white transition-opacity hover:opacity-80">
                Sell
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-border bg-card p-4">
            <h3 className="mb-2 text-sm font-semibold text-foreground/50">Mini Chart</h3>
            <Sparkline data={player.valueHistory} positive={positive} />
          </div>
        </div>
      </div>
    </div>
  );
}
