import type { Position } from "@/domain/player/player";
import { POSITION_LABEL } from "@/domain/player/player";
import { position_color } from "@/ui/design/tokens";

export function PositionBadge({ position }: { position: Position }) {
  return (
    <span
      style={{
        display: "inline-flex",
        padding: "3px 9px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 700,
        background: position_color[position] + "20",
        color: position_color[position],
      }}
    >
      {POSITION_LABEL[position]}
    </span>
  );
}
