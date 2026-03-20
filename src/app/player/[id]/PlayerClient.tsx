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
      className="flex items-center gap-2 rounded-lg border border-border bg-background p-2 text-xs transition-colors hover:bg-card-hover"
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

function Jersey({ number, name, teamColor }: { number: number; name: string; teamColor: string }) {
  const lastName = name.split(" ").pop() || name;
  return (
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
  );
}

const teamColors: Record<string, string> = {
  psg: "#004170", rma: "#FEBE10", bar: "#A50044", liv: "#C8102E", mci: "#6CABDD", bay: "#DC052D",
};

export default function PlayerClient({ id }: { id: string }) {
  const player = getPlayer(id);
  const [hoveredEvent, setHoveredEvent] = useState<PriceEvent | null>(null);

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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column: chart + fixtures */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Player header card */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-start gap-5">
              {/* Jersey */}
              <div className="w-24 h-28 flex-shrink-0">
                <Jersey number={player.number} name={player.name} teamColor={teamColor} />
              </div>

              {/* Info */}
              <div className="flex-1">
                <h1 className="text-3xl font-bold">{player.name}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-foreground/50">
                  <span>{player.nationality}</span>
                  <span className="rounded bg-foreground/10 px-2 py-0.5 font-semibold text-foreground/70">{player.position}</span>
                  <span>{player.team}</span>
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

          {/* Price chart with events */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground/50">Price History</h2>
              {hoveredEvent && (
                <div className="flex items-center gap-2 text-xs">
                  <span className={`inline-block h-2 w-2 rounded-full ${hoveredEvent.impact === "positive" ? "bg-green" : hoveredEvent.impact === "negative" ? "bg-red" : "bg-accent"}`} />
                  <span className="text-foreground/70">{hoveredEvent.text}</span>
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
            {/* Event timeline */}
            {priceEvents.length > 0 && (
              <div className="mt-4 space-y-2">
                <h3 className="text-xs font-semibold text-foreground/40 uppercase tracking-wider">News &amp; Events</h3>
                {priceEvents.map((ev, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className={`mt-0.5 inline-block h-2 w-2 flex-shrink-0 rounded-full ${ev.impact === "positive" ? "bg-green" : ev.impact === "negative" ? "bg-red" : "bg-accent"}`} />
                    <span className="text-foreground/40 flex-shrink-0">{ev.date}</span>
                    <span className="text-foreground/70">{ev.text}</span>
                  </div>
                ))}
              </div>
            )}
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

        {/* Right column: profile + stats + trade */}
        <div className="flex flex-col gap-6">
          {/* Profile */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="mb-4 text-sm font-semibold text-foreground/50">Profile</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-background p-3">
                <div className="text-foreground/40 text-xs">Age</div>
                <div className="font-bold">{player.age} yrs</div>
              </div>
              <div className="rounded-lg bg-background p-3">
                <div className="text-foreground/40 text-xs">Foot</div>
                <div className="font-bold">{player.foot}</div>
              </div>
              <div className="rounded-lg bg-background p-3">
                <div className="text-foreground/40 text-xs">Height</div>
                <div className="font-bold">{player.height} cm</div>
              </div>
              <div className="rounded-lg bg-background p-3">
                <div className="text-foreground/40 text-xs">Weight</div>
                <div className="font-bold">{player.weight} kg</div>
              </div>
            </div>
          </div>

          {/* Skills */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="mb-3 text-sm font-semibold text-foreground/50">Skills</h2>
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

          {/* Trade */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="mb-4 text-sm font-semibold text-foreground/50">Trade</h2>
            <div className="mb-4">
              <label className="mb-1 block text-xs text-foreground/40">Quantity</label>
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
        </div>
      </div>
    </div>
  );
}
