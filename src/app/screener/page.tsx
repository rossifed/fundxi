"use client";
import { useState, useMemo } from "react";
import { players, teams, Position } from "@/data/mock";
import PlayerCard from "@/components/PlayerCard";

const positions: Position[] = ["GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST"];

export default function ScreenerPage() {
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [posFilter, setPosFilter] = useState("");
  const [sortBy, setSortBy] = useState<"value" | "change" | "rating">("value");

  const filtered = useMemo(() => {
    let list = [...players];

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.team.toLowerCase().includes(q)
      );
    }
    if (teamFilter) list = list.filter((p) => p.teamId === teamFilter);
    if (posFilter) list = list.filter((p) => p.position === posFilter);

    list.sort((a, b) => {
      if (sortBy === "value") return b.value - a.value;
      if (sortBy === "change")
        return (b.value - b.previousValue) - (a.value - a.previousValue);
      return b.stats.rating - a.stats.rating;
    });

    return list;
  }, [search, teamFilter, posFilter, sortBy]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Player Screener</h1>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search player or team..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:border-accent focus:outline-none"
        />
        <select
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
        >
          <option value="">All Teams</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.shortName}
            </option>
          ))}
        </select>
        <select
          value={posFilter}
          onChange={(e) => setPosFilter(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
        >
          <option value="">All Positions</option>
          {positions.map((pos) => (
            <option key={pos} value={pos}>
              {pos}
            </option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as "value" | "change" | "rating")}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
        >
          <option value="value">Sort by Value</option>
          <option value="change">Sort by 24h Change</option>
          <option value="rating">Sort by Rating</option>
        </select>
      </div>

      <div className="text-sm text-foreground/40 mb-4">{filtered.length} players</div>

      {/* Player grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p) => (
          <PlayerCard key={p.id} player={p} />
        ))}
      </div>
    </div>
  );
}
