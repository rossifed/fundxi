export function LiveBadge() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        background: "rgba(255,255,255,.1)",
        padding: "7px 12px",
        borderRadius: 10,
        fontSize: 11,
        fontWeight: 700,
        color: "rgba(255,255,255,.5)",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "rgba(255,255,255,.5)",
          animation: "pulse 1.5s infinite",
        }}
      />
      LIVE
    </span>
  );
}
