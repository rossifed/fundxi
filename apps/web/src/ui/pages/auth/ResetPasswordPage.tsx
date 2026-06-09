import { useState, type FormEvent } from "react";
import { auth_api } from "@fundxi/core/api/auth_api";
import { ApiError } from "@fundxi/core/infrastructure/api_client";

/* ResetPasswordPage — full-screen "choose a new password" view.
 *
 * Reached from the email link ``{APP_BASE_URL}/reset-password?token=…``.
 * The user is anonymous here (they forgot their password), so this renders
 * outside the authenticated shell. On success the backend has already
 * invalidated every old session; we bounce the user to sign in with the
 * new password. */

interface ResetPasswordPageProps {
  token: string;
  /** Called when the user is done (success or cancel) — clears the URL token
   * and returns to the app. ``signed_out`` hints the caller to open sign-in. */
  on_done: (opts: { open_login: boolean }) => void;
}

export function ResetPasswordPage({ token, on_done }: ResetPasswordPageProps) {
  const [password, set_password] = useState("");
  const [confirm, set_confirm] = useState("");
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const [done, set_done] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;
  const can_submit = password.length >= 8 && password === confirm && !busy;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
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

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#020406",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "12vh 16px 32px",
        overflowY: "auto",
        zIndex: 1000,
      }}
    >
      <div
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
        {done ? (
          <>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.4 }}>Password updated</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,.5)" }}>
              Your password has been changed and you've been signed out everywhere. Sign in with your
              new password.
            </div>
            <button
              type="button"
              onClick={() => on_done({ open_login: true })}
              style={primary_btn(true)}
            >
              Sign in
            </button>
          </>
        ) : (
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.4 }}>Choose a new password</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.5)" }}>
              At least 8 characters. This link can only be used once.
            </div>

            <label style={field_label}>
              New password
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={e => set_password(e.target.value)}
                style={field_input}
              />
            </label>
            <label style={field_label}>
              Confirm password
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirm}
                onChange={e => set_confirm(e.target.value)}
                style={field_input}
              />
            </label>

            {mismatch && <div style={hint_style}>The two passwords don't match.</div>}
            {error && (
              <div role="alert" style={error_style}>
                {error}
              </div>
            )}

            <button type="submit" disabled={!can_submit} style={primary_btn(can_submit)}>
              {busy ? "…" : "Update password"}
            </button>
            <button
              type="button"
              onClick={() => on_done({ open_login: false })}
              style={{
                background: "none",
                border: "none",
                color: "rgba(255,255,255,.55)",
                fontWeight: 700,
                cursor: "pointer",
                fontSize: 12,
                fontFamily: "inherit",
              }}
            >
              Back to fundXI
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function friendly_error_message(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 400) return "This reset link is invalid or has expired. Request a new one.";
    if (err.status === 0 || err.status >= 502) {
      return "We could not reach the server. Check your connection and try again.";
    }
    return err.message || "Could not update your password.";
  }
  if (err instanceof TypeError) {
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

const hint_style: React.CSSProperties = {
  fontSize: 12,
  color: "rgba(255,255,255,.5)",
  fontWeight: 600,
};

const error_style: React.CSSProperties = {
  padding: "10px 12px",
  background: "rgba(255,40,93,.1)",
  border: "1px solid rgba(255,40,93,.35)",
  borderRadius: 8,
  color: "var(--color-negative)",
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1.4,
};

const primary_btn = (enabled: boolean): React.CSSProperties => ({
  padding: "11px 16px",
  background: "var(--color-action-buy)",
  color: "#0d0d0f",
  border: "none",
  borderRadius: 8,
  fontWeight: 800,
  fontSize: 14,
  cursor: enabled ? "pointer" : "not-allowed",
  opacity: enabled ? 1 : 0.5,
  marginTop: 4,
  fontFamily: "inherit",
});
