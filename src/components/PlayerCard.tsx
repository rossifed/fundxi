"use client";
import Link from "next/link";
import { Player, formatValue, pnlColor, pnlSign } from "@/data/mock";
import Sparkline from "./Sparkline";

export default function PlayerCard({ player }: { player: Player }) {
  const change = player.value - player.previousValue;
  const changePct = (change / player.previousValue) * 100;
  const positive = change >= 0;

  return (
    <Link
      href={`/player/${player.id}`}
      className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-card-hover"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-lg font-bold text-accent">
        {player.number}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate">{player.name}</div>
        <div className="text-sm text-foreground/50">
          {player.nationality} {player.position} · {player.team}
        </div>
      </div>
      <Sparkline data={player.valueHistory} positive={positive} />
      <div className="text-right">
        <div className="font-semibold">{formatValue(player.value)}</div>
        <div className={`text-sm ${pnlColor(change)}`}>
          {pnlSign(change)}{change.toFixed(1)} ({pnlSign(changePct)}{changePct.toFixed(1)}%)
        </div>
      </div>
    </Link>
  );
}
