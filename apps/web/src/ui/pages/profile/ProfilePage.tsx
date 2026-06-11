import { useAuth } from "@/ui/shell/AuthContext";

interface ProfilePageProps {
  on_navigate_tab: (tab: string) => void;
}

/* Profile page — strictly bound to authenticated state.
 *
 * Previously this page rendered fake trading stats, fake favorites and
 * fake settings hardcoded in TS. That violated the "no synthetic data"
 * rule. Until those concepts have a real backend source they don't
 * exist in the UI. */

export function ProfilePage({ on_navigate_tab }: ProfilePageProps) {
  const { user, status, logout } = useAuth();

  if (status === "loading") {
    return (
      <div style={{ padding: "60px 20px", textAlign: "center", color: "rgba(255,255,255,.45)", fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  if (status === "anonymous" || !user) {
    return (
      <div style={{ padding: "60px 20px", textAlign: "center", color: "rgba(255,255,255,.55)" }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 6 }}>
          Sign in to view your profile
        </div>
        <div style={{ fontSize: 13 }}>
          Use the buttons in the top right to sign in or create an account.
        </div>
      </div>
    );
  }

  const initials = user.name
    .split(/\s+/)
    .map(w => w.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div style={{ padding: "0 20px 32px", maxWidth: 560, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: 18,
            background: "rgba(255,255,255,.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            fontWeight: 800,
            color: "#fff",
            border: "2px solid color-mix(in srgb, var(--color-positive) 30%, transparent)",
            flexShrink: 0,
          }}
        >
          {initials || "?"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{user.name}</div>
          <div
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,.45)",
              marginTop: 3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {user.email}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          onClick={() => on_navigate_tab("portfolio")}
          style={{
            width: "100%",
            padding: "14px 0",
            fontSize: 13,
            fontWeight: 700,
            borderRadius: 12,
            background: "color-mix(in srgb, var(--color-positive) 8%, transparent)",
            color: "var(--color-positive)",
            border: "1px solid color-mix(in srgb, var(--color-positive) 12%, transparent)",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Go to Portfolio
        </button>
        <button
          onClick={() => on_navigate_tab("leagues")}
          style={{
            width: "100%",
            padding: "14px 0",
            fontSize: 13,
            fontWeight: 700,
            borderRadius: 12,
            background: "rgba(255,255,255,.04)",
            color: "rgba(255,255,255,.7)",
            border: "1px solid rgba(255,255,255,.06)",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Manage Leagues
        </button>
        <button
          onClick={() => void logout()}
          style={{
            width: "100%",
            padding: "14px 0",
            fontSize: 13,
            fontWeight: 700,
            borderRadius: 12,
            background: "color-mix(in srgb, var(--color-negative) 8%, transparent)",
            color: "var(--color-negative)",
            border: "1px solid color-mix(in srgb, var(--color-negative) 16%, transparent)",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
