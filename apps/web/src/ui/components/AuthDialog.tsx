/* AuthDialog — Sign-in / Sign-up / Forgot-password modal.
 * Email + password. "Forgot password?" switches to a request-reset sub-mode
 * that mails a one-time link (handled by ResetPasswordPage on the way back). */

import { useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/ui/shell/AuthContext";
import { auth_api } from "@fundxi/core/api/auth_api";
import { ApiError } from "@fundxi/core/infrastructure/api_client";

type Mode = "login" | "register" | "forgot";

interface AuthDialogProps {
  initial_mode?: Mode;
  on_close: () => void;
}

export function AuthDialog({ initial_mode = "login", on_close }: AuthDialogProps) {
  const { login, register } = useAuth();
  const [mode, set_mode] = useState<Mode>(initial_mode);
  const [email, set_email] = useState("");
  const [password, set_password] = useState("");
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const [sent, set_sent] = useState(false); // forgot: request submitted

  const go_mode = (next: Mode) => {
    set_mode(next);
    set_error(null);
    set_sent(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    set_busy(true);
    set_error(null);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
        on_close();
      } else if (mode === "register") {
        await register(email.trim(), password);
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

  const can_submit =
    mode === "forgot"
      ? email.length > 0 && !busy
      : email.length > 0 && password.length >= 8 && !busy;

  const title =
    mode === "login" ? "Sign in" : mode === "register" ? "Create your account" : "Reset your password";
  const subtitle =
    mode === "login"
      ? "Welcome back. Log in to access your portfolio."
      : mode === "register"
        ? "Email + password. That's it."
        : "Enter your email and we'll send you a link to choose a new password.";

  return createPortal(
    <div
      onClick={on_close}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.55)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "10vh 16px 32px",
        overflowY: "auto",
        zIndex: 1000,
      }}
    >
      <form
        onClick={ev => ev.stopPropagation()}
        onSubmit={submit}
        style={{
          width: 360,
          background: "#0d1419",
          border: "1px solid rgba(255,255,255,.08)",
          borderRadius: 14,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          color: "#fff",
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.4 }}>{title}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,.5)" }}>{subtitle}</div>

        {mode === "forgot" && sent ? (
          <>
            <div style={success_style}>
              If an account exists for that email, a reset link is on its way. The link expires in 1
              hour.
            </div>
            <button type="button" onClick={() => go_mode("login")} style={link_btn}>
              Back to sign in
            </button>
          </>
        ) : (
          <>
            <label style={field_label}>
              Email
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={e => set_email(e.target.value)}
                style={field_input}
              />
            </label>

            {mode !== "forgot" && (
              <label style={field_label}>
                Password
                <input
                  type="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={e => set_password(e.target.value)}
                  style={field_input}
                />
              </label>
            )}

            {mode === "login" && (
              <button
                type="button"
                onClick={() => go_mode("forgot")}
                style={{ ...link_btn, alignSelf: "flex-start", marginTop: -6 }}
              >
                Forgot password?
              </button>
            )}

            {error && (
              <div role="alert" style={error_style}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!can_submit}
              style={{
                padding: "11px 16px",
                background: "var(--color-action-buy)",
                color: "#0d0d0f",
                border: "none",
                borderRadius: 8,
                fontWeight: 800,
                fontSize: 14,
                cursor: can_submit ? "pointer" : "not-allowed",
                opacity: can_submit ? 1 : 0.5,
                marginTop: 4,
              }}
            >
              {busy ? "…" : mode === "login" ? "Sign in" : mode === "register" ? "Sign up" : "Send reset link"}
            </button>

            <div style={{ fontSize: 12, color: "rgba(255,255,255,.55)", textAlign: "center" }}>
              {mode === "forgot" ? (
                <>
                  Remembered it?{" "}
                  <button type="button" onClick={() => go_mode("login")} style={link_btn}>
                    Sign in
                  </button>
                </>
              ) : (
                <>
                  {mode === "login" ? "No account yet? " : "Already registered? "}
                  <button
                    type="button"
                    onClick={() => go_mode(mode === "login" ? "register" : "login")}
                    style={link_btn}
                  >
                    {mode === "login" ? "Sign up" : "Sign in"}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </form>
    </div>,
    document.body,
  );
}

function friendly_error_message(err: unknown, mode: Mode): string {
  if (err instanceof ApiError) {
    if (err.status === 0 || err.status === 502 || err.status === 503 || err.status === 504) {
      return "We could not reach the server. Check your connection and try again.";
    }
    if (err.status === 401) return "Wrong email or password.";
    if (err.status === 409) return "An account with this email already exists. Try signing in instead.";
    if (err.status === 422 || err.status === 400) {
      // Bubble up the backend's own validation message — already cleaned by api_client.
      return err.message || "Please check your email and password.";
    }
    return (
      err.message ||
      (mode === "login"
        ? "Could not sign you in."
        : mode === "register"
          ? "Could not create your account."
          : "Could not send the reset link.")
    );
  }
  if (err instanceof TypeError) {
    // ``fetch`` throws TypeError on network failure / CORS / aborted.
    return "We could not reach the server. Check your connection and try again.";
  }
  if (err instanceof Error) return err.message;
  return "Unexpected error.";
}

const field_label: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 11,
  fontWeight: 700,
  color: "rgba(255,255,255,.6)",
  letterSpacing: 0.4,
  textTransform: "uppercase",
};

const field_input: React.CSSProperties = {
  padding: "10px 12px",
  background: "rgba(255,255,255,.04)",
  border: "1px solid rgba(255,255,255,.1)",
  borderRadius: 8,
  color: "#fff",
  fontSize: 14,
  outline: "none",
  fontFamily: "inherit",
};

const error_style: React.CSSProperties = {
  padding: "10px 12px",
  background: "color-mix(in srgb, var(--color-negative) 10%, transparent)",
  border: "1px solid color-mix(in srgb, var(--color-negative) 35%, transparent)",
  borderRadius: 8,
  color: "var(--color-negative)",
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1.4,
};

const success_style: React.CSSProperties = {
  padding: "10px 12px",
  background: "color-mix(in srgb, var(--color-positive) 8%, transparent)",
  border: "1px solid color-mix(in srgb, var(--color-positive) 25%, transparent)",
  borderRadius: 8,
  color: "var(--color-positive)",
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1.4,
};

const link_btn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--color-accent)",
  fontWeight: 700,
  cursor: "pointer",
  padding: 0,
  fontFamily: "inherit",
  fontSize: 12,
};
