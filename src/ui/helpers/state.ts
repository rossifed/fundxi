// Toggle a value in a Set (used by filter UIs).
export const toggle_set = <T>(set: Set<T>, set_fn: (s: Set<T>) => void, value: T) => {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  set_fn(next);
};
