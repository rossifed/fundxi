// L1 widget title — used at the top of every card/widget across the app for
// visual consistency. White bold 13px on a padded header bar with a bottom
// border separating it from the card body.
//
// For sub-sections inside a card (level 2), use a small uppercase grey label
// inline (e.g. "Up next", "Top gainers") — not this component.

interface SectionHeaderProps {
  title: string;
  cta?: string;
  meta?: string;
  on_cta?: () => void;
}

export function SectionHeader({ title, cta, meta, on_cta }: SectionHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 18px 12px",
        borderBottom: "1px solid rgba(255,255,255,.05)",
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 800, color: "#fff", letterSpacing: 0.2 }}>
        {title}
      </span>
      {cta ? (
        <span
          onClick={on_cta}
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,.4)",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {cta}
        </span>
      ) : meta ? (
        <span style={{ fontSize: 11, color: "rgba(255,255,255,.3)" }}>{meta}</span>
      ) : null}
    </div>
  );
}
