import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { ambient_gradient } from "@/ui/design/tokens";
import { useViewport } from "@/ui/hooks/use_viewport";

interface SheetProps {
  open: boolean;
  on_close: () => void;
  children: ReactNode;
  footer?: ReactNode;
  max_width?: number;
}

// Centered modal on desktop, anchored bottom-sheet on phone — same content,
// same flow, different presentation (the web parity of the native RN bottom
// sheets). The slideUp keyframe (translateY 100% -> 0) reads as a sheet rising
// from the bottom edge in both modes.
export function Sheet({ open, on_close, children, footer, max_width = 720 }: SheetProps) {
  const { is_mobile } = useViewport();
  if (!open) return null;
  // Portal to <body> so the sheet escapes any ancestor stacking context (the
  // app's centered container has its own z-index, which would otherwise trap
  // the sheet *below* the fixed BottomNav and hide the footer buttons).
  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: is_mobile ? "flex-end" : "center",
        justifyContent: "center",
        padding: is_mobile ? 0 : 24,
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
          maxWidth: is_mobile ? "100%" : max_width,
          maxHeight: is_mobile ? "94vh" : "92vh",
          background: ambient_gradient,
          // Rounded top corners only when anchored to the bottom edge.
          borderRadius: is_mobile ? "16px 16px 0 0" : 16,
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
              padding: is_mobile
                ? "14px 20px calc(14px + env(safe-area-inset-bottom))"
                : "14px 20px",
              borderTop: "1px solid rgba(255,255,255,.06)",
              background: "#020109",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
