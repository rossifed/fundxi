// Five bottom tabs mirroring the web sidebar (apps/web/src/ui/shell/Sidebar.tsx).
// Labels + Unicode glyph icons are kept identical so users recognise the same
// app when switching desktop ↔ mobile (see fundxi/CLAUDE.md "UI direction").

import { Tabs } from "expo-router";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { themes } from "@fundxi/core/design/palette";

import { useAuth } from "@/components/AuthContext";
import { PortfolioBar } from "@/components/PortfolioBar";

const palette = themes.dark;

// Right-side auth control: "Sign in" when anonymous, the user's initial
// (tap to sign out) when authenticated — the RN parity for the web header
// auth buttons / avatar.
function AuthControl() {
  const { status, user, prompt, logout } = useAuth();
  if (status === "authenticated" && user) {
    const initial = (user.name || user.email).trim().charAt(0).toUpperCase();
    return (
      <Pressable
        onPress={() =>
          Alert.alert("Account", user.email, [
            { text: "Cancel", style: "cancel" },
            { text: "Sign out", style: "destructive", onPress: () => void logout() },
          ])
        }
        hitSlop={8}
      >
        <View style={header_styles.avatar}>
          <Text style={header_styles.avatar_text}>{initial}</Text>
        </View>
      </Pressable>
    );
  }
  if (status === "anonymous") {
    return (
      <Pressable onPress={() => prompt("login")} hitSlop={8}>
        <Text style={header_styles.signin}>Sign in</Text>
      </Pressable>
    );
  }
  return null;
}

// Custom header: screen title row + the always-on PortfolioBar underneath,
// mirroring the web shell (Header + sticky PortfolioBar). We own the top
// safe-area inset since we replace the native header.
function TabHeader({ title }: { title: string }) {
  const insets = useSafeAreaInsets();
  // Transparent so the root ambient gradient (brightest top-right) shows
  // behind the title + portfolio bar — the premium glow the web has.
  return (
    <View style={{ paddingTop: insets.top }}>
      <View style={header_styles.title_row}>
        <Text style={header_styles.title}>{title}</Text>
        <AuthControl />
      </View>
      <PortfolioBar />
    </View>
  );
}

const header_styles = StyleSheet.create({
  title_row: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  title: { color: "#fff", fontSize: 20, fontWeight: "800" },
  signin: { color: "#fff", fontSize: 13, fontWeight: "700" },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatar_text: { color: "#fff", fontSize: 13, fontWeight: "800" },
});

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
        header: ({ options }) => <TabHeader title={options.title ?? ""} />,
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
