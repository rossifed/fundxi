"use client";
import Link from "next/link";
import { Fixture } from "@/data/mock";

function StatusBadge({ status }: { status: Fixture["status"] }) {
  const styles = {
    live: "bg-red/20 text-red animate-pulse",
    upcoming: "bg-accent/20 text-accent",
    finished: "bg-foreground/10 text-foreground/50",
  };
  const labels = { live: "LIVE", upcoming: "Upcoming", finished: "Finished" };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

export default function FixtureCard({ fixture }: { fixture: Fixture }) {
  const date = new Date(fixture.date);
  const dateStr = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Link
      href={`/fixtures/${fixture.id}`}
      className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-card-hover"
    >
      <div className="flex flex-1 items-center justify-end gap-2 text-right">
        <span className="font-semibold">{fixture.homeTeam.shortName}</span>
        <div
          className="h-8 w-8 rounded-full"
          style={{ backgroundColor: fixture.homeTeam.color }}
        />
      </div>

      <div className="flex flex-col items-center gap-1 min-w-[100px]">
        {fixture.score ? (
          <div className="text-2xl font-bold">
            {fixture.score.home} - {fixture.score.away}
          </div>
        ) : (
          <div className="text-lg text-foreground/50">{dateStr}</div>
        )}
        <StatusBadge status={fixture.status} />
        {fixture.status === "live" && fixture.minute && (
          <span className="text-xs text-foreground/50">{fixture.minute}&apos;</span>
        )}
      </div>

      <div className="flex flex-1 items-center gap-2">
        <div
          className="h-8 w-8 rounded-full"
          style={{ backgroundColor: fixture.awayTeam.color }}
        />
        <span className="font-semibold">{fixture.awayTeam.shortName}</span>
      </div>
    </Link>
  );
}
