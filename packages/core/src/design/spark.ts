// Pure sparkline geometry — shared by every renderer (web SVG today,
// RN react-native-svg tomorrow). No rendering, no DOM: just the maths.

export interface SparkGeometry {
  // Space-separated "x,y x,y ..." string usable as the `points` attribute
  // of an SVG <polyline> / <polygon> on every platform.
  points: string;
  // Helper to close the polyline into a filled polygon from the baseline.
  filled_points: string;
  // Whether the trend is up (last >= first). Used to pick the default
  // stroke colour. Flat / empty data defaults to up to match the bigger
  // chart components.
  is_up: boolean;
}

export function compute_spark_geometry(
  data: ReadonlyArray<number>,
  width: number,
  height: number,
): SparkGeometry {
  if (data.length === 0) {
    return { points: "", filled_points: `0,${height} ${width},${height}`, is_up: true };
  }

  // A single point has no meaningful trend or range — render it dead-centre.
  if (data.length === 1) {
    const point = `${width / 2},${height / 2}`;
    return { points: point, filled_points: `0,${height} ${point} ${width},${height}`, is_up: true };
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);

  const points = data
    .map((value, i) => {
      const x = i * step;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  const is_up = data[data.length - 1] >= data[0];

  return {
    points,
    filled_points: `0,${height} ${points} ${width},${height}`,
    is_up,
  };
}
