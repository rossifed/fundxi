interface HeaderProps {
  on_logo_click: () => void;
}

export function Header({ on_logo_click }: HeaderProps) {
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
        <div
          className="mono"
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            background: "rgba(255,255,255,.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 800,
            color: "#fff",
          }}
        >
          XI
        </div>
        <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.2 }}>FundXI</span>
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

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 12, color: "rgba(255,255,255,.25)" }}>Prototype</span>
      </div>
    </header>
  );
}
