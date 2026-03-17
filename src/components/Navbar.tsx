"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "FundXI", isLogo: true },
  { href: "/fixtures", label: "Fixtures" },
  { href: "/screener", label: "Screener" },
  { href: "/portfolio/build", label: "Build" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-1 px-4">
        {links.map((link) => {
          const active =
            link.href === "/"
              ? pathname === "/"
              : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                link.isLogo
                  ? "mr-4 text-lg font-bold text-accent"
                  : active
                  ? "bg-accent/10 text-accent"
                  : "text-foreground/60 hover:text-foreground"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
        <div className="flex-1" />
        <Link
          href="/login"
          className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Login
        </Link>
      </div>
    </nav>
  );
}
