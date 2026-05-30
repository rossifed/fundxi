// TeamLink — wraps a team reference so a tap opens the team.
//
// DDD role: UI presentation component (interaction wrapper). Mirrors
// apps/web/src/ui/components/TeamLink.tsx. In RN the touch responder system
// already prevents the tap from reaching an outer Pressable (no DOM-style
// bubbling), so no stopPropagation is needed — the inner Pressable wins.
// When `on_open_team` is undefined the children render bare.

import type { ReactNode } from "react";
import { Pressable, type StyleProp, type ViewStyle } from "react-native";

interface TeamLinkProps {
  team_id: string;
  on_open_team?: (team_id: string) => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function TeamLink({ team_id, on_open_team, children, style }: TeamLinkProps) {
  if (!on_open_team) return <>{children}</>;
  return (
    <Pressable
      style={({ pressed }) => [style, pressed && { opacity: 0.6 }]}
      onPress={() => on_open_team(team_id)}
      accessibilityRole="button"
      accessibilityLabel="Open team"
      hitSlop={4}
    >
      {children}
    </Pressable>
  );
}
