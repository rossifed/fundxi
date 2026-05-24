/* AuthDialog — minimal Sign-in / Sign-up modal.
 * Email + password. Defers everything else to a future Profile flow. */

import { useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/ui/shell/AuthContext";
import { ApiError } from "@fundxi/core/infrastructure/api_client";

interface AuthDialogProps {
  initial_mode?: "login" | "register";
  on_close: () => void;
}

export function AuthDialog({ initial_mode = "login", on_close }: AuthDialogProps) {
  const { login, register } = useAuth();
  const [mode, set_mode] = useState<"login" | "register">(initial_mode);
  const [email, set_email] = useState("");
  const [password, set_password] = useState("");
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    set_busy(true);
    set_error(null);
    try {
      if (mode === "login") await login(email.trim(), password);
      else await register(email.trim(), password);
      on_close();
    } catch (err) {
      set_error(friendly_error_message(err, mode));
    } finally {
      set_busy(false);
    }
  };

  const can_submit = email.length > 0 && password.length >= 8 && !busy;

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
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.4 }}>
          {mode === "login" ? "Sign in" : "Create your account"}
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,.5)" }}>
          {mode === "login"
            ? "Welcome back. Log in to access your portfolio."
            : "Email + password. That's it."}
        </div>

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

        {error && (
          <div
            role="alert"
            style={{
              padding: "10px 12px",
              background: "rgba(255,40,93,.1)",
              border: "1px solid rgba(255,40,93,.35)",
              borderRadius: 8,
              color: "var(--color-negative)",
              fontSize: 13,
              fontWeight: 600,
              lineHeight: 1.4,
            }}
          >
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
          {busy ? "…" : mode === "login" ? "Sign in" : "Sign up"}
        </button>

        <div style={{ fontSize: 12, color: "rgba(255,255,255,.55)", textAlign: "center" }}>
          {mode === "login" ? "No account yet? " : "Already registered? "}
          <button
            type="button"
            onClick={() => {
              set_mode(mode === "login" ? "register" : "login");
              set_error(null);
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-accent)",
              fontWeight: 700,
              cursor: "pointer",
              padding: 0,
              fontFamily: "inherit",
              fontSize: 12,
            }}
          >
            {mode === "login" ? "Sign up" : "Sign in"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function friendly_error_message(err: unknown, mode: "login" | "register"): string {
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
    return err.message || (mode === "login" ? "Could not sign you in." : "Could not create your account.");
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
