"use client";
import { leaderboard, pnlColor, pnlSign } from "@/data/mock";

export default function LeaderboardPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Leaderboard</h1>

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-left">
          <thead className="bg-card text-sm text-foreground/50">
            <tr>
              <th className="px-4 py-3 font-medium">Rank</th>
              <th className="px-4 py-3 font-medium">Player</th>
              <th className="px-4 py-3 text-right font-medium">Portfolio Value</th>
              <th className="px-4 py-3 text-right font-medium">P&L</th>
              <th className="px-4 py-3 text-right font-medium">Return</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((entry) => (
              <tr
                key={entry.rank}
                className={`border-t border-border transition-colors hover:bg-card-hover ${
                  entry.username === "You" ? "bg-accent/5" : ""
                }`}
              >
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                      entry.rank === 1
                        ? "bg-yellow-500/20 text-yellow-400"
                        : entry.rank === 2
                        ? "bg-gray-300/20 text-gray-300"
                        : entry.rank === 3
                        ? "bg-amber-600/20 text-amber-500"
                        : "text-foreground/40"
                    }`}
                  >
                    {entry.rank}
                  </span>
                </td>
                <td className="px-4 py-3 font-semibold">
                  {entry.username === "You" ? (
                    <span className="text-accent">{entry.username}</span>
                  ) : (
                    entry.username
                  )}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  €{entry.portfolioValue.toLocaleString()}M
                </td>
                <td className={`px-4 py-3 text-right font-mono ${pnlColor(entry.pnl)}`}>
                  {pnlSign(entry.pnl)}€{Math.abs(entry.pnl).toLocaleString()}M
                </td>
                <td className={`px-4 py-3 text-right font-mono ${pnlColor(entry.pnlPercent)}`}>
                  {pnlSign(entry.pnlPercent)}{entry.pnlPercent.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
