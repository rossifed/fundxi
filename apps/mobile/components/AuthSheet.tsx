// AuthSheet — Sign in / Sign up modal. RN port of
// apps/web/src/ui/components/AuthDialog.tsx (email + password, mode toggle).
//
// DDD role: UI presentation. No network code of its own — it calls the
// `login`/`register` handlers passed by AuthContext, which delegate to
// `auth_api` in @fundxi/core (same surface the web uses). Auth rides on the
// session cookie that RN's native fetch persists; no token handling here.

import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ApiError } from "@fundxi/core/infrastructure/api_client";

import { Logo } from "@/components/Logo";
import { palette, text } from "@/theme/tokens";

type Mode = "login" | "register";

interface AuthSheetProps {
  visible: boolean;
  initial_mode: Mode;
  on_close: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
}

export function AuthSheet({ visible, initial_mode, on_close, login, register }: AuthSheetProps) {
  const [mode, set_mode] = useState<Mode>(initial_mode);
  const [email, set_email] = useState("");
  const [password, set_password] = useState("");
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState<string | null>(null);

  // Re-sync the mode when reopened in a specific mode (e.g. trade -> register).
  const [last_initial, set_last_initial] = useState<Mode>(initial_mode);
  if (visible && last_initial !== initial_mode) {
    set_last_initial(initial_mode);
    set_mode(initial_mode);
  }

  const can_submit = email.length > 0 && password.length >= 8 && !busy;

  const submit = async () => {
    if (!can_submit) return;
    set_busy(true);
    set_error(null);
    try {
      if (mode === "login") await login(email.trim(), password);
      else await register(email.trim(), password);
      // Reset on success, then let the caller close.
      set_email("");
      set_password("");
      on_close();
    } catch (err) {
      set_error(friendly_error_message(err, mode));
    } finally {
      set_busy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={on_close}>
      <Pressable style={styles.backdrop} onPress={on_close}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.kav}>
          {/* Stop propagation so taps inside the card don't dismiss. */}
          <Pressable style={styles.card} onPress={() => {}}>
            <Logo size={30} style={styles.logo} />
            <Text style={styles.title}>{mode === "login" ? "Sign in" : "Create account"}</Text>
            <Text style={styles.subtitle}>
              {mode === "login" ? "Welcome back to fundXI." : "Start trading World Cup players."}
            </Text>

            <TextInput
              style={styles.input}
              value={email}
              onChangeText={set_email}
              placeholder="Email"
              placeholderTextColor={text.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              inputMode="email"
            />
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={set_password}
              placeholder="Password (min 8 characters)"
              placeholderTextColor={text.muted}
              secureTextEntry
              autoCapitalize="none"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              onSubmitEditing={submit}
              returnKeyType="go"
            />

            {error && <Text style={styles.error}>{error}</Text>}

            <Pressable
              style={[styles.submit, !can_submit && styles.submit_disabled]}
              onPress={submit}
              disabled={!can_submit}
            >
              {busy ? (
                <ActivityIndicator color="#04140a" />
              ) : (
                <Text style={styles.submit_label}>{mode === "login" ? "Sign in" : "Create account"}</Text>
              )}
            </Pressable>

            <Pressable
              style={styles.toggle}
              onPress={() => {
                set_mode(m => (m === "login" ? "register" : "login"));
                set_error(null);
              }}
            >
              <Text style={styles.toggle_label}>
                {mode === "login" ? "No account? Create one" : "Already have an account? Sign in"}
              </Text>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function friendly_error_message(err: unknown, mode: Mode): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "Incorrect email or password.";
    if (err.status === 409) return "That email is already in use.";
    if (err.status === 422 || err.status === 400) return "Please enter a valid email and password.";
  }
  return mode === "login" ? "Could not sign in. Please try again." : "Could not create the account. Please try again.";
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  kav: { width: "100%" },
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
  subtitle: { color: text.secondary, fontSize: 13, marginTop: -4, marginBottom: 4 },
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
