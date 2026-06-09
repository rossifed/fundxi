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
import { auth_api } from "@fundxi/core/api/auth_api";

import { Logo } from "@/components/Logo";
import { palette, text } from "@/theme/tokens";

type Mode = "login" | "register" | "forgot";

interface AuthSheetProps {
  visible: boolean;
  initial_mode: "login" | "register";
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
  const [sent, set_sent] = useState(false); // forgot: request submitted

  // Re-sync the mode when reopened in a specific mode (e.g. trade -> register).
  const [last_initial, set_last_initial] = useState<Mode>(initial_mode);
  if (visible && last_initial !== initial_mode) {
    set_last_initial(initial_mode);
    set_mode(initial_mode);
    set_sent(false);
  }

  const go_mode = (next: Mode) => {
    set_mode(next);
    set_error(null);
    set_sent(false);
  };

  const can_submit =
    mode === "forgot" ? email.length > 0 && !busy : email.length > 0 && password.length >= 8 && !busy;

  const submit = async () => {
    if (!can_submit) return;
    set_busy(true);
    set_error(null);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
        set_email("");
        set_password("");
        on_close();
      } else if (mode === "register") {
        await register(email.trim(), password);
        set_email("");
        set_password("");
        on_close();
      } else {
        // Always succeeds from the UI's side — the backend never reveals
        // whether the email exists (no enumeration).
        await auth_api.request_password_reset(email.trim());
        set_sent(true);
      }
    } catch (err) {
      set_error(friendly_error_message(err, mode));
    } finally {
      set_busy(false);
    }
  };

  const title = mode === "login" ? "Sign in" : mode === "register" ? "Create account" : "Reset password";
  const subtitle =
    mode === "login"
      ? "Welcome back to fundXI."
      : mode === "register"
        ? "Start trading World Cup players."
        : "Enter your email and we'll send you a link to choose a new password.";
  const submit_label =
    mode === "login" ? "Sign in" : mode === "register" ? "Create account" : "Send reset link";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={on_close}>
      <Pressable style={styles.backdrop} onPress={on_close}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.kav}>
          {/* Stop propagation so taps inside the card don't dismiss. */}
          <Pressable style={styles.card} onPress={() => {}}>
            <Logo size={30} style={styles.logo} />
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>

            {mode === "forgot" && sent ? (
              <>
                <Text style={styles.success}>
                  If an account exists for that email, a reset link is on its way. The link expires in
                  1 hour.
                </Text>
                <Pressable style={styles.toggle} onPress={() => go_mode("login")}>
                  <Text style={styles.toggle_label}>Back to sign in</Text>
                </Pressable>
              </>
            ) : (
              <>
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
                {mode !== "forgot" && (
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
                )}

                {mode === "login" && (
                  <Pressable style={styles.forgot} onPress={() => go_mode("forgot")} hitSlop={6}>
                    <Text style={styles.forgot_label}>Forgot password?</Text>
                  </Pressable>
                )}

                {error && <Text style={styles.error}>{error}</Text>}

                <Pressable
                  style={[styles.submit, !can_submit && styles.submit_disabled]}
                  onPress={submit}
                  disabled={!can_submit}
                >
                  {busy ? (
                    <ActivityIndicator color="#04140a" />
                  ) : (
                    <Text style={styles.submit_label}>{submit_label}</Text>
                  )}
                </Pressable>

                <Pressable
                  style={styles.toggle}
                  onPress={() =>
                    go_mode(mode === "forgot" ? "login" : mode === "login" ? "register" : "login")
                  }
                >
                  <Text style={styles.toggle_label}>
                    {mode === "forgot"
                      ? "Remembered it? Sign in"
                      : mode === "login"
                        ? "No account? Create one"
                        : "Already have an account? Sign in"}
                  </Text>
                </Pressable>
              </>
            )}
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
  success: { color: palette.positive, fontSize: 13, fontWeight: "600", lineHeight: 18 },
  forgot: { alignSelf: "flex-start", marginTop: -2 },
  forgot_label: { color: palette.accent, fontSize: 13, fontWeight: "700" },
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
