"use client";

export default function Sparkline({
  data,
  positive,
}: {
  data: number[];
  positive: boolean;
}) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  return (
    <div className="sparkline">
      {data.map((v, i) => (
        <div
          key={i}
          className="sparkline-bar"
          style={{
            height: `${((v - min) / range) * 100}%`,
            minHeight: "3px",
            backgroundColor: positive
              ? "var(--green)"
              : "var(--red)",
          }}
        />
      ))}
    </div>
  );
}
