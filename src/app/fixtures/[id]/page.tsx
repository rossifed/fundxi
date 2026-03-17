"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  getFixture,
  getPlayer,
  positionCoords,
  awayCoords,
  formatValue,
  pnlColor,
  pnlSign,
  Player,
} from "@/data/mock";
import Link from "next/link";

function PlayerDot({
  player,
  x,
  y,
  isHome,
  onSelect,
}: {
  player: Player;
  x: number;
  y: number;
  isHome: boolean;
  onSelect: (p: Player) => void;
}) {
  return (
    <button
      onClick={() => onSelect(player)}
      className="absolute flex flex-col items-center transition-transform hover:scale-110"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: "translate(-50%, -50%)",
      }}
    >
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white shadow-lg ${
          isHome ? "bg-blue-600" : "bg-amber-500"
        }`}
      >
        {player.number}
      </div>
      <span className="mt-0.5 whitespace-nowrap rounded bg-black/60 px-1 text-[10px] text-white">
        {player.name.split(" ").pop()}
      </span>
    </button>
  );
}

export default function FixtureDetailPage() {
  const { id } = useParams();
  const fixture = getFixture(id as string);
  const [selected, setSelected] = useState<Player | null>(null);

  if (!fixture) {
    return <div className="py-20 text-center text-foreground/50">Fixture not found</div>;
  }

  const homePlayers = fixture.homePlayers.map((pid) => getPlayer(pid)).filter(Boolean) as Player[];
  const awayPlayers = fixture.awayPlayers.map((pid) => getPlayer(pid)).filter(Boolean) as Player[];

  const statusLabel =
    fixture.status === "live"
      ? `LIVE ${fixture.minute}'`
      : fixture.status === "upcoming"
      ? "Upcoming"
      : "Full Time";

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <Link href="/fixtures" className="text-sm text-accent hover:underline">
          &larr; All Fixtures
        </Link>
        <span
          className={`rounded-full px-3 py-1 text-sm font-semibold ${
            fixture.status === "live"
              ? "bg-red/20 text-red animate-pulse"
              : fixture.status === "upcoming"
              ? "bg-accent/20 text-accent"
              : "bg-foreground/10 text-foreground/50"
          }`}
        >
          {statusLabel}
        </span>
      </div>

      {/* Score */}
      <div className="mb-6 flex items-center justify-center gap-6 text-center">
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-full"
            style={{ backgroundColor: fixture.homeTeam.color }}
          />
          <span className="text-xl font-bold">{fixture.homeTeam.shortName}</span>
        </div>
        <div className="text-3xl font-bold">
          {fixture.score ? `${fixture.score.home} - ${fixture.score.away}` : "vs"}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold">{fixture.awayTeam.shortName}</span>
          <div
            className="h-10 w-10 rounded-full"
            style={{ backgroundColor: fixture.awayTeam.color }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Pitch */}
        <div className="lg:col-span-2">
          <div className="pitch">
            <div className="pitch-center-line" />
            <div className="pitch-center-circle" />
            <div className="pitch-box-top" />
            <div className="pitch-box-bottom" />

            {homePlayers.map((p) => {
              const coords = positionCoords[p.position];
              return (
                <PlayerDot
                  key={p.id}
                  player={p}
                  x={coords.x}
                  y={coords.y}
                  isHome={true}
                  onSelect={setSelected}
                />
              );
            })}
            {awayPlayers.map((p) => {
              const coords = awayCoords(p.position);
              return (
                <PlayerDot
                  key={p.id}
                  player={p}
                  x={coords.x}
                  y={coords.y}
                  isHome={false}
                  onSelect={setSelected}
                />
              );
            })}
          </div>
        </div>

        {/* Sidebar: selected player + live feed */}
        <div className="flex flex-col gap-4">
          {/* Selected player panel */}
          {selected ? (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-lg font-bold text-accent">
                  {selected.number}
                </div>
                <div>
                  <div className="font-semibold">{selected.name}</div>
                  <div className="text-sm text-foreground/50">
                    {selected.nationality} {selected.position} · {selected.team}
                  </div>
                </div>
              </div>

              <div className="mb-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold">{formatValue(selected.value)}</span>
                <span className={`text-sm ${pnlColor(selected.value - selected.previousValue)}`}>
                  {pnlSign(selected.value - selected.previousValue)}
                  {(selected.value - selected.previousValue).toFixed(1)}M
                </span>
              </div>

              <div className="mb-3 grid grid-cols-4 gap-2 text-center text-sm">
                <div>
                  <div className="font-semibold">{selected.stats.goals}</div>
                  <div className="text-foreground/40">Goals</div>
                </div>
                <div>
                  <div className="font-semibold">{selected.stats.assists}</div>
                  <div className="text-foreground/40">Assists</div>
                </div>
                <div>
                  <div className="font-semibold">{selected.stats.matches}</div>
                  <div className="text-foreground/40">Matches</div>
                </div>
                <div>
                  <div className="font-semibold">{selected.stats.rating}</div>
                  <div className="text-foreground/40">Rating</div>
                </div>
              </div>

              <div className="flex gap-2">
                <button className="flex-1 rounded-lg bg-green py-2 text-sm font-semibold text-white transition-opacity hover:opacity-80">
                  Buy
                </button>
                <button className="flex-1 rounded-lg bg-red py-2 text-sm font-semibold text-white transition-opacity hover:opacity-80">
                  Sell
                </button>
              </div>

              <Link
                href={`/player/${selected.id}`}
                className="mt-2 block text-center text-sm text-accent hover:underline"
              >
                View full profile &rarr;
              </Link>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-foreground/30">
              Click a player on the pitch to see their valuation
            </div>
          )}

          {/* Live feed */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground/50">Match Feed</h3>
            <div className="flex max-h-[300px] flex-col gap-2 overflow-y-auto">
              {fixture.events.length === 0 ? (
                <div className="text-sm text-foreground/30">No events yet</div>
              ) : (
                [...fixture.events].reverse().map((event, i) => (
                  <div
                    key={i}
                    className="flex gap-2 text-sm"
                  >
                    <span className="w-8 shrink-0 text-right font-mono text-foreground/40">
                      {event.minute}&apos;
                    </span>
                    <span className="text-foreground/70">{event.text}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
