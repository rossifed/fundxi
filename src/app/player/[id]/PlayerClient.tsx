"use client";
import { useState } from "react";
import Link from "next/link";
import { getPlayer, formatValue, pnlColor, pnlSign, getPlayerFixtures, getPlayerPriceEvents, Fixture } from "@/data/mock";
import AreaChart from "@/components/AreaChart";
import type { PriceEvent } from "@/data/mock";

function FixtureMini({ fixture }: { fixture: Fixture }) {
  const date = new Date(fixture.date);
  const dateStr = date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <Link
      href={`/fixtures/${fixture.id}`}
      className="flex items-center gap-2 rounded-lg border border-border bg-background p-2.5 text-xs transition-colors hover:bg-card-hover"
    >
      <div className="h-4 w-4 rounded-full flex-shrink-0" style={{ backgroundColor: fixture.homeTeam.color }} />
      <span className="font-semibold">{fixture.homeTeam.shortName}</span>
      {fixture.score ? (
        <span className="font-bold">{fixture.score.home}-{fixture.score.away}</span>
      ) : (
        <span className="text-foreground/40">{dateStr}</span>
      )}
      <span className="font-semibold">{fixture.awayTeam.shortName}</span>
      <div className="h-4 w-4 rounded-full flex-shrink-0" style={{ backgroundColor: fixture.awayTeam.color }} />
      {fixture.status === "live" && (
        <span className="ml-auto rounded-full bg-red/20 px-1.5 py-0.5 text-[10px] font-bold text-red animate-pulse">
          LIVE {fixture.minute}&apos;
        </span>
      )}
      {fixture.status === "finished" && (
        <span className="ml-auto text-foreground/30">FT</span>
      )}
      {fixture.status === "upcoming" && (
        <span className="ml-auto text-accent text-[10px]">Upcoming</span>
      )}
    </Link>
  );
}

function Jersey({ number, name, teamColor, size = "md" }: { number: number; name: string; teamColor: string; size?: "sm" | "md" | "lg" }) {
  const lastName = name.split(" ").pop() || name;
  const sizeClass = size === "lg" ? "w-28 h-[8.5rem]" : size === "sm" ? "w-14 h-[4.25rem]" : "w-20 h-24";
  return (
    <div className={sizeClass}>
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

const teamColors: Record<string, string> = {
  psg: "#004170", rma: "#FEBE10", bar: "#A50044", liv: "#C8102E", mci: "#6CABDD", bay: "#DC052D",
};

export default function PlayerClient({ id }: { id: string }) {
  const player = getPlayer(id);
  const [hoveredEvent, setHoveredEvent] = useState<PriceEvent | null>(null);
  const [qty, setQty] = useState(1);

  if (!player) {
    return <div className="py-20 text-center text-foreground/50">Player not found</div>;
  }

  const change = player.value - player.previousValue;
  const changePct = (change / player.previousValue) * 100;
  const positive = change >= 0;
  const priceEvents = getPlayerPriceEvents(id);
  const fixtures = getPlayerFixtures(id);
  const allFixtures = [...fixtures.live, ...fixtures.upcoming, ...fixtures.past];
  const teamColor = teamColors[player.teamId] || "#3b82f6";

  return (
    <div>
      <Link href="/screener" className="mb-6 inline-block text-sm text-accent hover:underline">
        &larr; Back to Screener
      </Link>

      {/* Player header: jersey + info + physical attributes */}
      <div className="mb-6 rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start gap-5">
          <Jersey number={player.number} name={player.name} teamColor={teamColor} size="lg" />

          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold">{player.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-foreground/50">
              <span>{player.nationality}</span>
              <span className="rounded bg-foreground/10 px-2 py-0.5 font-semibold text-foreground/70">{player.position}</span>
              <span>{player.country}</span>
            </div>

            {/* Physical info row */}
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <div>
                <span className="text-foreground/40">Age </span>
                <span className="font-semibold">{player.age}</span>
              </div>
              <div>
                <span className="text-foreground/40">Height </span>
                <span className="font-semibold">{player.height} cm</span>
              </div>
              <div>
                <span className="text-foreground/40">Weight </span>
                <span className="font-semibold">{player.weight} kg</span>
              </div>
              <div>
                <span className="text-foreground/40">Foot </span>
                <span className="font-semibold">{player.foot}</span>
              </div>
            </div>

            {/* Value */}
            <div className="mt-3 flex items-baseline gap-3">
              <span className="text-4xl font-bold">{formatValue(player.value)}</span>
              <span className={`text-lg font-semibold ${pnlColor(change)}`}>
                {pnlSign(change)}{change.toFixed(1)}M ({pnlSign(changePct)}{changePct.toFixed(1)}%)
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Trade buttons + quantity — above chart */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-xs text-foreground/40">Qty</label>
                <input
                  type="number"
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                  min={1}
                  className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground text-center focus:border-accent focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-2 text-sm text-foreground/50">
                <span>Est.</span>
                <span className="font-semibold text-foreground">{formatValue(player.value * qty)}</span>
              </div>
              <div className="ml-auto flex gap-2">
                <button className="rounded-lg bg-green px-6 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-80">
                  Buy
                </button>
                <button className="rounded-lg bg-red px-6 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-80">
                  Sell
                </button>
              </div>
            </div>
          </div>

          {/* Price chart with events */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground/50">Price History</h2>
              {hoveredEvent && (
                <div className="flex items-center gap-2 text-xs max-w-[60%]">
                  <span className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${hoveredEvent.impact === "positive" ? "bg-green" : hoveredEvent.impact === "negative" ? "bg-red" : "bg-accent"}`} />
                  <span className="text-foreground/70 truncate">{hoveredEvent.text}</span>
                </div>
              )}
            </div>
            <div className="rounded-xl bg-background p-4">
              <AreaChart
                data={player.valueHistory}
                positive={positive}
                height={220}
                events={priceEvents}
                onEventHover={setHoveredEvent}
                showLabels
              />
            </div>
            {/* Event timeline — one per data point */}
            <div className="mt-4 space-y-1.5">
              <h3 className="text-xs font-semibold text-foreground/40 uppercase tracking-wider mb-2">News &amp; Events</h3>
              {priceEvents.map((ev, i) => (
                <div key={i} className="flex items-start gap-2 text-xs py-0.5">
                  <span className={`mt-0.5 inline-block h-2 w-2 flex-shrink-0 rounded-full ${ev.impact === "positive" ? "bg-green" : ev.impact === "negative" ? "bg-red" : "bg-accent"}`} />
                  <span className="text-foreground/30 flex-shrink-0 w-20">{ev.date}</span>
                  <span className="text-foreground/60">{ev.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Fixtures */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="mb-3 text-sm font-semibold text-foreground/50">Fixtures</h2>
            {allFixtures.length > 0 ? (
              <div className="space-y-2">
                {allFixtures.map((f) => (
                  <FixtureMini key={f.id} fixture={f} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-foreground/30">No fixtures scheduled</p>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">
          {/* Bio / Description */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="mb-3 text-sm font-semibold text-foreground/50">Scouting Report</h2>
            <p className="text-sm leading-relaxed text-foreground/70">{player.bio}</p>
          </div>

          {/* Skills */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="mb-3 text-sm font-semibold text-foreground/50">Key Skills</h2>
            <div className="flex flex-wrap gap-2">
              {player.skills.map((s) => (
                <span key={s} className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
                  {s}
                </span>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="mb-3 text-sm font-semibold text-foreground/50">Season Stats</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-background p-3 text-center">
                <div className="text-2xl font-bold">{player.stats.goals}</div>
                <div className="text-xs text-foreground/40">Goals</div>
              </div>
              <div className="rounded-lg bg-background p-3 text-center">
                <div className="text-2xl font-bold">{player.stats.assists}</div>
                <div className="text-xs text-foreground/40">Assists</div>
              </div>
              <div className="rounded-lg bg-background p-3 text-center">
                <div className="text-2xl font-bold">{player.stats.matches}</div>
                <div className="text-xs text-foreground/40">Matches</div>
              </div>
              <div className="rounded-lg bg-background p-3 text-center">
                <div className="text-2xl font-bold">{player.stats.rating}</div>
                <div className="text-xs text-foreground/40">Rating</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
