"use client";
import Link from "next/link";
import { Player, formatValue, pnlColor, pnlSign } from "@/data/mock";
import AreaChart from "./AreaChart";

const teamColors: Record<string, string> = {
  psg: "#004170", rma: "#FEBE10", bar: "#A50044", liv: "#C8102E", mci: "#6CABDD", bay: "#DC052D",
};

export function Jersey({ number, name, teamColor, size = "md" }: { number: number; name: string; teamColor: string; size?: "sm" | "md" | "lg" }) {
  const lastName = name.split(" ").pop() || name;
  const sizeClass = size === "lg" ? "w-28 h-[8.5rem]" : size === "sm" ? "w-12 h-[3.5rem]" : "w-16 h-20";
  return (
    <div className={`${sizeClass} flex-shrink-0`}>
      <svg viewBox="0 0 120 140" className="w-full h-full">
        <path d="M20 35 L10 50 L10 130 L110 130 L110 50 L100 35 L85 25 L75 30 Q60 38 45 30 L35 25 Z" fill={teamColor} opacity="0.9" />
        <path d="M45 30 Q60 38 75 30 Q68 22 60 20 Q52 22 45 30" fill={teamColor} opacity="0.7" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
        <path d="M20 35 L2 55 L10 60 L10 50 L20 35" fill={teamColor} opacity="0.7" />
        <path d="M100 35 L118 55 L110 60 L110 50 L100 35" fill={teamColor} opacity="0.7" />
        <line x1="35" y1="25" x2="20" y2="35" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
        <line x1="85" y1="25" x2="100" y2="35" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
        <text x="60" y="85" textAnchor="middle" fill="white" fontSize="32" fontWeight="bold" fontFamily="Arial, sans-serif" opacity="0.95">{number}</text>
        <text x="60" y="115" textAnchor="middle" fill="white" fontSize={lastName.length > 12 ? "7" : lastName.length > 9 ? "8" : "10"} fontWeight="600" fontFamily="Arial, sans-serif" letterSpacing="1" opacity="0.9">{lastName.toUpperCase()}</text>
      </svg>
    </div>
  );
}

export function getTeamColor(teamId: string): string {
  return teamColors[teamId] || "#3b82f6";
}

export default function PlayerCard({ player }: { player: Player }) {
  const change = player.value - player.previousValue;
  const changePct = (change / player.previousValue) * 100;
  const positive = change >= 0;
  const teamColor = getTeamColor(player.teamId);

  return (
    <Link
      href={`/player/${player.id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all hover:border-accent/40 hover:shadow-lg hover:shadow-accent/5 hover:-translate-y-1"
    >
      {/* Top gradient bar */}
      <div className="h-1" style={{ background: teamColor }} />

      {/* Card body */}
      <div className="flex gap-3 p-4">
        <Jersey number={player.number} name={player.name} teamColor={teamColor} />

        <div className="flex-1 min-w-0">
          <div className="min-w-0">
            <h3 className="font-bold truncate leading-tight">{player.name}</h3>
            <div className="flex items-center gap-1.5 mt-0.5 text-xs text-foreground/50">
              <span>{player.nationality}</span>
              <span className="rounded bg-foreground/10 px-1.5 py-0.5 font-semibold text-foreground/70">{player.position}</span>
              <span className="truncate">{player.country}</span>
            </div>
          </div>

          <div className="mt-2 flex items-end justify-between gap-2">
            <div className="flex-1 h-8 opacity-60 group-hover:opacity-100 transition-opacity">
              <AreaChart data={player.valueHistory} positive={positive} height={32} mini />
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-sm font-bold leading-tight">{formatValue(player.value)}</div>
              <div className={`text-xs ${pnlColor(change)}`}>
                {pnlSign(change)}{changePct.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Skills row */}
      <div className="flex gap-1 px-4 pb-3 flex-wrap">
        {player.skills.slice(0, 3).map((s) => (
          <span key={s} className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
            {s}
          </span>
        ))}
      </div>
    </Link>
  );
}
