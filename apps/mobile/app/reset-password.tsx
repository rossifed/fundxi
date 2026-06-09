// ResetPasswordScreen — "choose a new password" deep-link target. RN port of
// apps/web/src/ui/pages/auth/ResetPasswordPage.tsx.
//
// Reached from the email link's mobile variant: fundxi://reset-password?token=…
// (expo-router maps the `token` query param via useLocalSearchParams). The
// user is anonymous here (they forgot their password). On success the backend
// has already invalidated every old session, so we bounce to the tabs and pop
// the sign-in sheet to log in with the new password.

import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";

import { auth_api } from "@fundxi/core/api/auth_api";
import { ApiError } from "@fundxi/core/infrastructure/api_client";

import { useAuth } from "@/components/AuthContext";
import { Logo } from "@/components/Logo";
import { palette, text } from "@/theme/tokens";

export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { prompt } = useAuth();
  const { token } = useLocalSearchParams<{ token?: string }>();

  const [password, set_password] = useState("");
  const [confirm, set_confirm] = useState("");
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const [done, set_done] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;
  const can_submit = !!token && password.length >= 8 && password === confirm && !busy;

  const submit = async () => {
    if (!can_submit || !token) return;
    set_busy(true);
    set_error(null);
    try {
      await auth_api.reset_password(token, password);
      set_done(true);
    } catch (err) {
      set_error(friendly_error_message(err));
    } finally {
      set_busy(false);
    }
  };

  const go_sign_in = () => {
    router.replace("/(tabs)");
    prompt("login");
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <Logo size={30} style={styles.logo} />

          {!token ? (
            <>
              <Text style={styles.title}>Invalid link</Text>
              <Text style={styles.subtitle}>
                This reset link is missing its token. Request a new one from the sign-in screen.
              </Text>
              <Pressable style={styles.toggle} onPress={() => router.replace("/(tabs)")}>
                <Text style={styles.toggle_label}>Back to fundXI</Text>
              </Pressable>
            </>
          ) : done ? (
            <>
              <Text style={styles.title}>Password updated</Text>
              <Text style={styles.subtitle}>
                Your password has been changed and you've been signed out everywhere. Sign in with your
                new password.
              </Text>
              <Pressable style={styles.submit} onPress={go_sign_in}>
                <Text style={styles.submit_label}>Sign in</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title}>Choose a new password</Text>
              <Text style={styles.subtitle}>At least 8 characters. This link can only be used once.</Text>

              <TextInput
                style={styles.input}
                value={password}
                onChangeText={set_password}
                placeholder="New password"
                placeholderTextColor={text.muted}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
              />
              <TextInput
                style={styles.input}
                value={confirm}
                onChangeText={set_confirm}
                placeholder="Confirm password"
                placeholderTextColor={text.muted}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                onSubmitEditing={submit}
                returnKeyType="go"
              />

              {mismatch && <Text style={styles.hint}>The two passwords don't match.</Text>}
              {error && <Text style={styles.error}>{error}</Text>}

              <Pressable
                style={[styles.submit, !can_submit && styles.submit_disabled]}
                onPress={submit}
                disabled={!can_submit}
              >
                {busy ? (
                  <ActivityIndicator color="#04140a" />
                ) : (
                  <Text style={styles.submit_label}>Update password</Text>
                )}
              </Pressable>

              <Pressable style={styles.toggle} onPress={() => router.replace("/(tabs)")}>
                <Text style={styles.toggle_label}>Back to fundXI</Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function friendly_error_message(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 400) return "This reset link is invalid or has expired. Request a new one.";
  }
  return "Could not update your password. Please try again.";
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingBottom: 32, maxWidth: 420, width: "100%", alignSelf: "center" },
  card: {
    backgroundColor: palette.surfaceDeep,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 22,
    gap: 12,
  },
  logo: { alignSelf: "center", marginBottom: 12 },
  title: { color: "#fff", fontSize: 22, fontWeight: "800" },
  subtitle: { color: text.secondary, fontSize: 13, marginTop: -4, marginBottom: 4, lineHeight: 18 },
  input: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#fff",
  },
  hint: { color: text.secondary, fontSize: 12, fontWeight: "600" },
  error: { color: palette.negative, fontSize: 13, fontWeight: "600" },
  submit: {
    backgroundColor: palette.actionBuy,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  submit_disabled: { opacity: 0.4 },
  submit_label: { color: "#04140a", fontSize: 15, fontWeight: "800" },
  toggle: { alignItems: "center", paddingVertical: 6 },
  toggle_label: { color: text.secondary, fontSize: 13, fontWeight: "600" },
});
