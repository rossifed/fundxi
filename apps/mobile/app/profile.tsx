// ProfilePage — account screen (pushed screen, reached by tapping the header
// avatar). RN port of apps/web/src/ui/pages/profile/ProfilePage.tsx — same
// states (loading / anonymous / authenticated), same content: avatar + name +
// email, then Go to Portfolio / Manage Leagues / Sign Out.
//
// Strictly bound to authenticated state. There are no trading stats, favorites
// or settings here: those would be synthetic until a real backend source
// exists (see fundxi/CLAUDE.md "No invented content"). Password / login
// management is intentionally absent — there is no real auth backend yet
// (Auth: TBD in the roadmap).

import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";

import { useAuth } from "@/components/AuthContext";
import { border, palette, surface, text } from "@/theme/tokens";

function initials_of(name: string): string {
  return name
    .split(/\s+/)
    .map(w => w.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, status, logout } = useAuth();

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12 }]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable style={styles.back} onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back_label}>← Back</Text>
        </Pressable>

        {status === "loading" ? (
          <Text style={styles.centered}>Loading…</Text>
        ) : status === "anonymous" || !user ? (
          <View style={styles.empty}>
            <Text style={styles.empty_title}>Sign in to view your profile</Text>
            <Text style={styles.empty_sub}>Use the avatar in the top right to sign in or create an account.</Text>
          </View>
        ) : (
          <View style={{ gap: 24 }}>
            <View style={styles.identity}>
              <View style={styles.avatar}>
                <Text style={styles.avatar_text}>{initials_of(user.name) || "?"}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name}>{user.name}</Text>
                <Text style={styles.email} numberOfLines={1}>
                  {user.email}
                </Text>
              </View>
            </View>

            <View style={{ gap: 8 }}>
              <Pressable style={[styles.btn, styles.btn_primary]} onPress={() => router.push("/portfolio")}>
                <Text style={[styles.btn_label, { color: palette.positive }]}>Go to Portfolio</Text>
              </Pressable>
              <Pressable style={[styles.btn, styles.btn_ghost]} onPress={() => router.push("/leagues")}>
                <Text style={[styles.btn_label, { color: text.secondary }]}>Manage Leagues</Text>
              </Pressable>
              <Pressable style={[styles.btn, styles.btn_danger]} onPress={() => void logout()}>
                <Text style={[styles.btn_label, { color: palette.negative }]}>Sign Out</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingBottom: 32, maxWidth: 560, width: "100%", alignSelf: "center" },
  back: { paddingVertical: 8, marginBottom: 8 },
  back_label: { color: text.secondary, fontSize: 13, fontWeight: "700" },

  centered: { paddingVertical: 60, textAlign: "center", color: text.tertiary, fontSize: 13 },
  empty: { paddingVertical: 60, alignItems: "center", gap: 6 },
  empty_title: { color: text.primary, fontSize: 18, fontWeight: "800" },
  empty_sub: { color: text.secondary, fontSize: 13, textAlign: "center" },

  identity: { flexDirection: "row", alignItems: "center", gap: 16 },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: surface.active,
    borderWidth: 2,
    borderColor: `${palette.positive}4d`,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar_text: { color: text.primary, fontSize: 22, fontWeight: "800" },
  name: { color: text.primary, fontSize: 20, fontWeight: "800" },
  email: { color: text.tertiary, fontSize: 13, marginTop: 3 },

  btn: { width: "100%", paddingVertical: 14, borderRadius: 12, alignItems: "center", borderWidth: 1 },
  btn_label: { fontSize: 13, fontWeight: "700" },
  btn_primary: { backgroundColor: `${palette.positive}14`, borderColor: `${palette.positive}1f` },
  btn_ghost: { backgroundColor: surface.card, borderColor: border },
  btn_danger: { backgroundColor: `${palette.negative}14`, borderColor: `${palette.negative}29` },
});
