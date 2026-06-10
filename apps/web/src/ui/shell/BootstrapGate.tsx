import { useEffect, useState } from "react";
import { init_public_repositories } from "@fundxi/core/infrastructure/repositories/init";
import { Logo } from "@/ui/shell/Logo";

type State = "loading" | "ready" | "error";

interface Props {
  children: React.ReactNode;
}

// Primes the backend-fed repository caches before rendering the app shell.
// This preserves the "sync repos" promise from CLAUDE.md (api/application/ui
// untouched) by paying the async cost ONCE at boot, in this single component.
export function BootstrapGate({ children }: Props) {
  const [state, set_state] = useState<State>("loading");
  const [error, set_error] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    init_public_repositories()
      .then(() => {
        if (!cancelled) set_state("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        set_error(err instanceof Error ? err.message : String(err));
        set_state("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "ready") return <>{children}</>;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#020406",
        color: "#fff",
        fontFamily: "'Inter',sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
      }}
    >
      {state === "loading" && (
        <>
          <Logo size={46} tagline />
          <div style={{ opacity: 0.6, fontSize: 13 }}>loading market data…</div>
        </>
      )}
      {state === "error" && (
        <>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--color-negative)" }}>
            backend unreachable
          </div>
          <div style={{ opacity: 0.7, fontSize: 13, maxWidth: 520, textAlign: "center" }}>
            {error}
          </div>
          <div style={{ opacity: 0.5, fontSize: 12 }}>
            check that the backend is running on{" "}
            <code style={{ background: "#111", padding: "2px 6px", borderRadius: 4 }}>
              {(import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000"}
            </code>
          </div>
        </>
      )}
    </div>
  );
}
