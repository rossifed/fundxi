import type { ReactNode } from "react";

interface SheetProps {
  open: boolean;
  on_close: () => void;
  children: ReactNode;
  footer?: ReactNode;
  max_width?: number;
}

// Centered modal on desktop. The mobile (RN) version will reimplement this as
// a bottom sheet — same content, same flow, different presentation.
export function Sheet({ open, on_close, children, footer, max_width = 720 }: SheetProps) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={on_close}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,.6)",
          backdropFilter: "blur(8px)",
        }}
      />

      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: max_width,
          maxHeight: "92vh",
          background: "#020406",
          borderRadius: 16,
          display: "flex",
          flexDirection: "column",
          border: "1px solid rgba(255,255,255,.08)",
          boxShadow: "0 24px 64px rgba(0,0,0,.5)",
          animation: "slideUp .25s ease",
          overflow: "hidden",
        }}
      >
        <button
          onClick={on_close}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            zIndex: 1,
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "rgba(255,255,255,.06)",
            border: "1px solid rgba(255,255,255,.06)",
            color: "rgba(255,255,255,.5)",
            cursor: "pointer",
            fontSize: 14,
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ✕
        </button>

        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>{children}</div>

        {footer && (
          <div
            style={{
              flexShrink: 0,
              padding: "14px 20px",
              borderTop: "1px solid rgba(255,255,255,.06)",
              background: "#020406",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
