// Five bottom tabs mirroring the web sidebar (apps/web/src/ui/shell/Sidebar.tsx).
// Labels + Unicode glyph icons are kept identical so users recognise the same
// app when switching desktop ↔ mobile (see fundxi/CLAUDE.md "UI direction").

import { Tabs } from "expo-router";
import { Text } from "react-native";

import { themes } from "@fundxi/core/design/palette";

const palette = themes.dark;

const TABS = [
  { name: "index", title: "Home", icon: "◆" },
  { name: "screener", title: "Screener", icon: "◎" },
  { name: "fixtures", title: "Fixtures", icon: "⬡" },
  { name: "portfolio", title: "Portfolio", icon: "◈" },
  { name: "leagues", title: "Leagues", icon: "▲" },
] as const;

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#fff",
        tabBarInactiveTintColor: "rgba(255,255,255,0.5)",
        tabBarStyle: {
          backgroundColor: palette.bg,
          borderTopColor: "rgba(255,255,255,0.04)",
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        headerStyle: { backgroundColor: palette.bg },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "800" },
      }}
    >
      {TABS.map(tab => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color }) => (
              <Text style={{ color, fontSize: 18 }}>{tab.icon}</Text>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
