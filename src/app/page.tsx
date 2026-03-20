"use client";

import Link from "next/link";
import { fixtures } from "@/data/mock";
import FixtureCard from "@/components/FixtureCard";
import { useEffect, useState } from "react";

function Countdown({ targetDate }: { targetDate: string }) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    function calc() {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
      return {
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      };
    }
    setTimeLeft(calc());
    const id = setInterval(() => setTimeLeft(calc()), 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  const units = [
    { label: "J", value: timeLeft.days },
    { label: "H", value: timeLeft.hours },
    { label: "M", value: timeLeft.minutes },
    { label: "S", value: timeLeft.seconds },
  ];

  return (
    <div className="flex gap-3">
      {units.map((u) => (
        <div key={u.label} className="flex flex-col items-center">
          <div className="rounded-lg bg-card border border-border px-3 py-2 text-2xl font-bold tabular-nums min-w-[3rem] text-center">
            {String(u.value).padStart(2, "0")}
          </div>
          <span className="mt-1 text-xs text-foreground/50">{u.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const liveFixtures = fixtures.filter((f) => f.status === "live");
  const upcomingFixtures = fixtures
    .filter((f) => f.status === "upcoming")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const nextFixtures = [...liveFixtures, ...upcomingFixtures].slice(0, 3);
  const nextUpcoming = upcomingFixtures[0];

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      {/* Hero */}
      <div className="mb-12 text-center">
        <h1 className="mb-4 text-5xl font-bold tracking-tight">
          <span className="text-accent">Fund</span>XI
        </h1>
        <p className="mb-2 text-xl text-foreground/70">
          Fantasy Football Meets Finance
        </p>
        <p className="mx-auto mb-8 max-w-lg text-foreground/50">
          Trade football players like stocks. Their value moves in real-time based on
          match performance and news. Build your portfolio, beat the market, climb
          the leaderboard.
        </p>

        {/* CTA buttons */}
        <div className="flex flex-wrap justify-center gap-4">
          <Link
            href="/fixtures"
            className="rounded-xl bg-accent px-8 py-3 text-lg font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            View Fixtures
          </Link>
          <Link
            href="/screener"
            className="rounded-xl border border-border bg-card px-8 py-3 text-lg font-semibold text-foreground transition-colors hover:bg-card-hover"
          >
            Explore Players
          </Link>
          <Link
            href="/leaderboard"
            className="rounded-xl border border-border bg-card px-8 py-3 text-lg font-semibold text-foreground transition-colors hover:bg-card-hover"
          >
            Leaderboard
          </Link>
          <Link
            href="/portfolio"
            className="rounded-xl border border-border bg-card px-8 py-3 text-lg font-semibold text-foreground transition-colors hover:bg-card-hover"
          >
            Mon Portefeuille
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-12 grid grid-cols-3 gap-8 text-center">
        <div>
          <div className="mb-2 text-3xl font-bold text-accent">44</div>
          <div className="text-sm text-foreground/50">Players listed</div>
        </div>
        <div>
          <div className="mb-2 text-3xl font-bold text-green">+12.4%</div>
          <div className="text-sm text-foreground/50">Avg portfolio return</div>
        </div>
        <div>
          <div className="mb-2 text-3xl font-bold text-foreground">5</div>
          <div className="text-sm text-foreground/50">Live fixtures</div>
        </div>
      </div>

      {/* Countdown to next event */}
      {nextUpcoming && (
        <div className="mb-12 rounded-2xl border border-border bg-card p-6 text-center">
          <h2 className="mb-1 text-lg font-semibold text-foreground/70">Prochain match</h2>
          <p className="mb-4 text-sm text-foreground/50">
            {nextUpcoming.homeTeam.shortName} vs {nextUpcoming.awayTeam.shortName} —{" "}
            {new Date(nextUpcoming.date).toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <div className="flex justify-center">
            <Countdown targetDate={nextUpcoming.date} />
          </div>
        </div>
      )}

      {/* Next fixtures */}
      {nextFixtures.length > 0 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Fixtures à venir</h2>
            <Link href="/fixtures" className="text-sm text-accent hover:underline">
              Voir tout
            </Link>
          </div>
          <div className="flex flex-col gap-3">
            {nextFixtures.map((f) => (
              <FixtureCard key={f.id} fixture={f} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
