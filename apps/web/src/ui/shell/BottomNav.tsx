// BottomNav — phone navigation strip, mirroring the desktop Sidebar and the
// native tab bar (apps/mobile/app/(tabs)/_layout.tsx). Same NAV_TABS, same
// glyph icons, same labels and active/inactive colors so users recognise the
// "same app" when switching desktop <-> web-mobile <-> native (CLAUDE.md "UI
// direction"). Fixed to the bottom; honours the iOS home-indicator safe area.
//
// DDD role: React presentation (shell). Pure rendering over NAV_TABS.

import { NAV_TABS } from "./Sidebar";

interface BottomNavProps {
  active_tab: string;
  on_navigate: (tab_id: string) => void;
}

export function BottomNav({ active_tab, on_navigate }: BottomNavProps) {
  return (
    <nav
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 100,
        display: "flex",
        background: "rgba(2,4,6,.92)",
        backdropFilter: "blur(20px)",
        borderTop: "1px solid rgba(255,255,255,.04)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {NAV_TABS.map(tab => {
        const active = tab.id === active_tab;
        return (
          <button
            key={tab.id}
            onClick={() => on_navigate(tab.id)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              padding: "8px 0 7px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              color: active ? "#fff" : "rgba(255,255,255,.5)",
              transition: "color .12s",
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>{tab.icon}</span>
            <span style={{ fontSize: 11, fontWeight: active ? 700 : 600 }}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
