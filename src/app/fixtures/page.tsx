"use client";
import { fixtures } from "@/data/mock";
import FixtureCard from "@/components/FixtureCard";

export default function FixturesPage() {
  const live = fixtures.filter((f) => f.status === "live");
  const upcoming = fixtures.filter((f) => f.status === "upcoming");
  const finished = fixtures.filter((f) => f.status === "finished");

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Fixtures</h1>

      {live.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-red">Live Now</h2>
          <div className="flex flex-col gap-3">
            {live.map((f) => (
              <FixtureCard key={f.id} fixture={f} />
            ))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-accent">Upcoming</h2>
          <div className="flex flex-col gap-3">
            {upcoming.map((f) => (
              <FixtureCard key={f.id} fixture={f} />
            ))}
          </div>
        </section>
      )}

      {finished.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-foreground/50">Finished</h2>
          <div className="flex flex-col gap-3">
            {finished.map((f) => (
              <FixtureCard key={f.id} fixture={f} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
