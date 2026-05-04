// Generate a deterministic spark series. Used purely for visual sparklines.
export const gen_spark = (change: number, seed: number, length = 20): number[] => {
  const s = seed * 7 + 13;
  return Array.from(
    { length },
    (_, i) => 50 + (change / 100) * i * 30 + Math.sin(i * s * 0.3) * 4 + Math.sin(i * 0.7 + s) * 3,
  );
};

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
