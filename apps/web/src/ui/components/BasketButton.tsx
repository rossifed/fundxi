// BasketButton — the generic auth-gated trigger that hosts a BasketDialog.
//
// DDD role: UI presentation. The SINGLE place that pairs the green "buy a basket"
// button with the shared BasketDialog and the auth gate. Callers supply the
// candidate list (already built) + labels; they never re-implement the dialog or
// the gate. Used by BuyTeamButton (a team's squad) and the Screener (a filter
// result) so neither the widget nor the logic is duplicated.

import { useState } from "react";
import type { BasketCandidate } from "@/ui/components/BasketDialog";
import { BasketDialog } from "@/ui/components/BasketDialog";
import { AuthDialog } from "@/ui/components/AuthDialog";
import { useAuth } from "@/ui/shell/AuthContext";

interface BasketButtonProps {
  label: string; // button text, e.g. "+ Buy team" or "Buy 12"
  title: string; // dialog title, e.g. "Buy France" or "Buy 12 players"
  accent: string; // dialog accent color
  candidates: BasketCandidate[];
  on_open_player: (player_id: number) => void;
  disabled?: boolean;
  disabled_title?: string; // tooltip explaining why it's disabled
  title_text?: string; // tooltip when enabled
  // Fired when the dialog actually opens (after the auth gate) — lets a caller
  // lazily load its candidates on first open.
  on_open?: () => void;
}

export function BasketButton({
  label,
  title,
  accent,
  candidates,
  on_open_player,
  disabled = false,
  disabled_title,
  title_text,
  on_open,
}: BasketButtonProps) {
  const { status: auth_status } = useAuth();
  const [open, set_open] = useState(false);
  const [auth_open, set_auth_open] = useState(false);

  const handle_click = () => {
    if (disabled) return;
    if (auth_status === "anonymous") {
      set_auth_open(true);
      return;
    }
    if (auth_status !== "authenticated") return;
    on_open?.();
    set_open(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handle_click}
        disabled={disabled}
        title={disabled ? disabled_title : title_text}
        style={{ ...basket_btn_style, opacity: disabled ? 0.4 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
      >
        {label}
      </button>
      {open && (
        <BasketDialog
          open={open}
          title={title}
          accent={accent}
          players={candidates}
          on_open_player={on_open_player}
          on_close={() => set_open(false)}
        />
      )}
      {auth_open && <AuthDialog initial_mode="register" on_close={() => set_auth_open(false)} />}
    </>
  );
}

/** Green primary "buy a basket" pill — the green action token (not a team color,
 * which can be empty). */
const basket_btn_style: React.CSSProperties = {
  background: "var(--color-action-buy)",
  border: "none",
  borderRadius: 9,
  padding: "9px 18px",
  fontSize: 13.5,
  fontWeight: 800,
  letterSpacing: 0.3,
  color: "var(--color-bg)",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
  boxShadow: "0 4px 16px color-mix(in srgb, var(--color-positive) 25%, transparent)",
};
