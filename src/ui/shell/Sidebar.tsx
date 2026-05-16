import { useState } from "react";
import { useAuth } from "@/ui/shell/AuthContext";

export interface NavTab {
  id: string;
  label: string;
  icon: string;
}

export const NAV_TABS: NavTab[] = [
  { id: "home", label: "Home", icon: "◆" },
  { id: "screener", label: "Screener", icon: "◎" },
  { id: "fixtures", label: "Fixtures", icon: "⬡" },
  { id: "portfolio", label: "Portfolio", icon: "◈" },
  { id: "leagues", label: "Leagues", icon: "▲" },
];

interface SidebarProps {
  active_tab: string;
  on_navigate: (tab_id: string) => void;
}

export function Sidebar({ active_tab, on_navigate }: SidebarProps) {
  const { user, status } = useAuth();

  return (
    <aside
      style={{
        width: 220,
        flexShrink: 0,
        borderRight: "1px solid rgba(255,255,255,.04)",
        position: "sticky",
        top: 92,
        alignSelf: "flex-start",
        height: "calc(100vh - 92px)",
        display: "flex",
        flexDirection: "column",
        padding: "16px 12px",
      }}
    >
      <nav style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {NAV_TABS.map(tab => (
          <NavItem
            key={tab.id}
            tab={tab}
            is_active={active_tab === tab.id}
            on_click={() => on_navigate(tab.id)}
          />
        ))}
      </nav>

      <div style={{ flex: 1 }} />

      {status === "authenticated" && user && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,.04)", paddingTop: 8, marginTop: 8 }}>
          <NavItem
            tab={{
              id: "profile",
              label: user.name,
              icon: user.name.charAt(0).toUpperCase() || "?",
            }}
            is_active={active_tab === "profile"}
            on_click={() => on_navigate("profile")}
            variant="profile"
          />
        </div>
      )}
    </aside>
  );
}

function NavItem({
  tab,
  is_active,
  on_click,
  variant = "default",
}: {
  tab: NavTab;
  is_active: boolean;
  on_click: () => void;
  variant?: "default" | "profile";
}) {
  const [hover, set_hover] = useState(false);
  const text_color = is_active ? "#fff" : hover ? "rgba(255,255,255,.85)" : "rgba(255,255,255,.5)";
  const bg = is_active ? "rgba(255,255,255,.06)" : hover ? "rgba(255,255,255,.025)" : "transparent";

  return (
    <button
      onClick={on_click}
      onMouseEnter={() => set_hover(true)}
      onMouseLeave={() => set_hover(false)}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderRadius: 8,
        background: bg,
        border: "none",
        cursor: "pointer",
        fontFamily: "inherit",
        color: text_color,
        fontSize: 13,
        fontWeight: is_active ? 700 : 500,
        textAlign: "left",
        transition: "background .12s, color .12s",
      }}
    >
      {is_active && (
        <span
          style={{
            position: "absolute",
            left: 0,
            top: 8,
            bottom: 8,
            width: 3,
            borderRadius: 2,
            background: "#fff",
          }}
        />
      )}
      {variant === "profile" ? (
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            background: "rgba(255,255,255,.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 800,
            color: "#fff",
          }}
        >
          {tab.icon}
        </div>
      ) : (
        <span
          style={{
            fontSize: 14,
            width: 18,
            textAlign: "center",
            opacity: is_active ? 1 : 0.7,
          }}
        >
          {tab.icon}
        </span>
      )}
      <span>{tab.label}</span>
    </button>
  );
}
