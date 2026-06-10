import { useState } from "react";
import { AuthDialog } from "@/ui/components/AuthDialog";
import { Avatar } from "@/ui/components/Avatar";
import { Logo } from "@/ui/shell/Logo";
import { useAuth } from "@/ui/shell/AuthContext";

interface HeaderProps {
  on_logo_click: () => void;
}

export function Header({ on_logo_click }: HeaderProps) {
  const { user, status, logout } = useAuth();
  const [dialog, set_dialog] = useState<null | "login" | "register">(null);

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        height: 56,
        padding: "0 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "rgba(2,4,6,.9)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,.04)",
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
        onClick={on_logo_click}
      >
        <Logo size={22} />
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "rgba(255,255,255,.4)",
            background: "rgba(255,255,255,.06)",
            padding: "3px 7px",
            borderRadius: 5,
            marginLeft: 4,
          }}
        >
          WC 2026
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {status === "authenticated" && user ? (
          <>
            <Avatar seed={String(user.id)} name={user.name} size={28} />
            <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.7)" }}>{user.name}</span>
            <button onClick={() => void logout()} style={ghost_btn}>Sign out</button>
          </>
        ) : status === "anonymous" ? (
          <>
            <button onClick={() => set_dialog("login")} style={ghost_btn}>Sign in</button>
            <button onClick={() => set_dialog("register")} style={primary_btn}>Sign up</button>
          </>
        ) : (
          <span style={{ fontSize: 12, color: "rgba(255,255,255,.25)" }}>…</span>
        )}
      </div>

      {dialog && <AuthDialog initial_mode={dialog} on_close={() => set_dialog(null)} />}
    </header>
  );
}

const ghost_btn: React.CSSProperties = {
  padding: "6px 12px",
  background: "transparent",
  color: "rgba(255,255,255,.7)",
  border: "1px solid rgba(255,255,255,.1)",
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};

const primary_btn: React.CSSProperties = {
  padding: "6px 12px",
  background: "var(--color-action-buy)",
  color: "#0d0d0f",
  border: "none",
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: "inherit",
};
