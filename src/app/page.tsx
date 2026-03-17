import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center text-center">
      <h1 className="mb-4 text-5xl font-bold tracking-tight">
        <span className="text-accent">Fund</span>XI
      </h1>
      <p className="mb-2 text-xl text-foreground/70">
        Fantasy Football Meets Finance
      </p>
      <p className="mb-8 max-w-lg text-foreground/50">
        Trade football players like stocks. Their value moves in real-time based on
        match performance and news. Build your portfolio, beat the market, climb
        the leaderboard.
      </p>

      <div className="flex gap-4">
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
      </div>

      <div className="mt-16 grid max-w-3xl grid-cols-3 gap-8 text-center">
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
    </div>
  );
}
