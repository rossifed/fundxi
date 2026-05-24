// Player avatar chip: jersey number on a team-color tinted square.
// The player name is rendered separately by the parent (no duplication).
//
// Legal note: jersey numbers and player names are public facts (press, match
// reports). No image rights, no club crests, no licensed kit designs are used
// here — just a generic colored square with a number.

interface PlayerChipProps {
  jersey_number: number;
  team_color: string;
  size?: number; // pixel size, default 32
}

// Normalize 3-digit hex (e.g. "#222") to 6-digit so alpha concat (#22222220) is valid.
function expand_hex(hex: string): string {
  if (hex.length === 4 && hex.startsWith("#")) {
    const r = hex[1];
    const g = hex[2];
    const b = hex[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return hex;
}

export function PlayerChip({ jersey_number, team_color, size = 32 }: PlayerChipProps) {
  const color = expand_hex(team_color);
  return (
    <div
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: Math.round(size * 0.22),
        background: `${color}22`,
        border: `1px solid ${color}55`,
        fontFamily: "'JetBrains Mono', monospace",
        fontWeight: 800,
        fontSize: Math.round(size * 0.42),
        color: "#fff",
        letterSpacing: -0.5,
        lineHeight: 1,
      }}
    >
      {jersey_number}
    </div>
  );
}
