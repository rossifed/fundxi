export const price_label = (value: number): string => (value >= 999 ? "∞" : "€" + value + "M");
