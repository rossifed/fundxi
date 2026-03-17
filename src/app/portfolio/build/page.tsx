"use client";
import { useState, useMemo } from "react";
import { players, formatValue, Player } from "@/data/mock";

const BUDGET = 500; // 500M€ starting budget

interface Holding {
  player: Player;
  qty: number;
}

export default function BuildPortfolioPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [search, setSearch] = useState("");

  const spent = holdings.reduce((s, h) => s + h.player.value * h.qty, 0);
  const remaining = BUDGET - spent;

  const filteredPlayers = useMemo(() => {
    if (!search) return players.slice(0, 15);
    const q = search.toLowerCase();
    return players.filter(
      (p) => p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q)
    );
  }, [search]);

  function addPlayer(p: Player) {
    if (p.value > remaining) return;
    setHoldings((prev) => {
      const existing = prev.find((h) => h.player.id === p.id);
      if (existing) {
        return prev.map((h) =>
          h.player.id === p.id ? { ...h, qty: h.qty + 1 } : h
        );
      }
      return [...prev, { player: p, qty: 1 }];
    });
  }

  function removePlayer(id: string) {
    setHoldings((prev) => {
      return prev
        .map((h) => (h.player.id === id ? { ...h, qty: h.qty - 1 } : h))
        .filter((h) => h.qty > 0);
    });
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">Build Your Portfolio</h1>
      <p className="mb-6 text-foreground/50">
        Budget: {formatValue(BUDGET)} · Remaining:{" "}
        <span className={remaining < 50 ? "text-red" : "text-green"}>
          {formatValue(remaining)}
        </span>
      </p>

      {/* Budget bar */}
      <div className="mb-6 h-3 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${(spent / BUDGET) * 100}%` }}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Player picker */}
        <div>
          <h2 className="mb-3 text-lg font-semibold">Add Players</h2>
          <input
            type="text"
            placeholder="Search player..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-3 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:border-accent focus:outline-none"
          />
          <div className="flex max-h-[500px] flex-col gap-2 overflow-y-auto">
            {filteredPlayers.map((p) => (
              <button
                key={p.id}
                onClick={() => addPlayer(p)}
                disabled={p.value > remaining}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-card-hover disabled:cursor-not-allowed disabled:opacity-30"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-sm font-bold text-accent">
                  {p.number}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{p.name}</div>
                  <div className="text-xs text-foreground/40">
                    {p.position} · {p.team}
                  </div>
                </div>
                <span className="text-sm font-semibold">{formatValue(p.value)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Current portfolio */}
        <div>
          <h2 className="mb-3 text-lg font-semibold">
            Your Selection ({holdings.reduce((s, h) => s + h.qty, 0)} players)
          </h2>
          {holdings.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-12 text-center text-foreground/30">
              Click players on the left to add them
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {holdings.map((h) => (
                <div
                  key={h.player.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-sm font-bold text-accent">
                    {h.player.number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{h.player.name}</div>
                    <div className="text-xs text-foreground/40">
                      {h.qty}x · {formatValue(h.player.value * h.qty)}
                    </div>
                  </div>
                  <button
                    onClick={() => removePlayer(h.player.id)}
                    className="rounded-lg bg-red/20 px-3 py-1 text-sm text-red hover:bg-red/30"
                  >
                    -
                  </button>
                  <button
                    onClick={() => addPlayer(h.player)}
                    disabled={h.player.value > remaining}
                    className="rounded-lg bg-green/20 px-3 py-1 text-sm text-green hover:bg-green/30 disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
              ))}

              <div className="mt-4 rounded-xl border border-accent bg-accent/10 p-4 text-center">
                <div className="text-sm text-foreground/50">Total Portfolio Value</div>
                <div className="text-2xl font-bold">{formatValue(spent)}</div>
              </div>

              <button className="mt-2 rounded-xl bg-accent py-3 font-semibold text-white transition-colors hover:bg-accent-hover">
                Confirm Portfolio
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
