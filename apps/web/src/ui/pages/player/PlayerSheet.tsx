/* PlayerSheet — the player detail modal.
 *
 * DDD role: React presentation (container). Composition root for the
 * player detail view: it owns the data the sub-panels share
 * (price-tick history, tournament stats) and the trade/auth state, then
 * assembles PlayerSheetHeader / PlayerValuationRibbon / PlayerPriceChart
 * / PlayerMatchLog / YourPositionCard. Each panel is its own file
 * (one file, one reason to change).
 *
 * Every value is real provider data — no synthesised bios or skills.
 */

import { useEffect, useState } from "react";
import { players_api } from "@fundxi/core/api/players_api";
import { portfolio_api } from "@fundxi/core/api/portfolio_api";
import { teams_api } from "@fundxi/core/api/teams_api";
import { valuations_api } from "@fundxi/core/api/valuations_api";
import { POSITION_LABEL, type Player } from "@fundxi/core/domain/player/player";
import type { PlayerTournamentStat } from "@fundxi/core/infrastructure/repositories/player_stats_repository";
import type { PricePoint } from "@fundxi/core/infrastructure/repositories/valuations_repository";
import { AuthDialog } from "@/ui/components/AuthDialog";
import { ClosePositionsDialog } from "@/ui/components/ClosePositionsDialog";
import { Sheet } from "@/ui/components/Sheet";
import { TradeDialog } from "@/ui/components/TradeDialog";
import { useLiveRefetch, usePlayerLiveVersion } from "@/ui/hooks/use_live_updates";
import { PlayerMatchLog } from "@/ui/pages/player/PlayerMatchLog";
import { PlayerPriceChart } from "@/ui/pages/player/PlayerPriceChart";
import { PlayerSheetHeader } from "@/ui/pages/player/PlayerSheetHeader";
import { PlayerStatistics, semantic_color } from "@/ui/pages/player/PlayerStatistics";
import { key_tournament_stats } from "@fundxi/core/domain/player/player_stat_view";
import { PlayerValuationRibbon } from "@/ui/pages/player/PlayerValuationRibbon";
import { YourPositionCard } from "@/ui/pages/player/YourPositionCard";
import { SectionCard, SmallKpi } from "@/ui/pages/player/player_sheet_ui";
import { useAuth } from "@/ui/shell/AuthContext";
import { useViewport } from "@/ui/hooks/use_viewport";

interface PlayerSheetProps {
  player: Player;
  on_close: () => void;
  go_portfolio?: () => void;
  go_match?: (fixture_id: number) => void;
  on_open_team?: (team_id: string) => void;
  watchlist?: Set<number>;
  toggle_watch?: (id: number) => void;
}

export function PlayerSheet({
  player,
  on_close,
  go_portfolio,
  go_match,
  on_open_team,
  watchlist,
  toggle_watch,
}: PlayerSheetProps) {
  const team = teams_api.get(player.team_id) ?? {
    id: "?",
    name: "?",
    flag: "🏳️",
    color: "#888",
    kind: "national" as const,
  };
  const valuation = valuations_api.get_for_player(player.id);
  const current_price = valuation?.current_price ?? 0;
  const performance_rating = valuation?.performance_rating ?? 0;

  const { is_mobile } = useViewport();
  const [trade_dialog_kind, set_trade_dialog_kind] = useState<"buy" | "sell" | null>(null);
  const [auth_prompt_open, set_auth_prompt_open] = useState(false);
  const [close_open, set_close_open] = useState(false);
  const { status: auth_status } = useAuth();
  const is_watched = watchlist?.has(player.id) ?? false;

  // Held position → the "Close position" button (mirrors the mobile sheet),
  // routed through the shared ClosePositionsDialog (confirm + execute).
  const holding_metrics = portfolio_api.get_holding_metrics(player.id);
  const has_position = !!holding_metrics && holding_metrics.shares !== 0;
  const on_close_position = has_position ? () => set_close_open(true) : undefined;

  const handle_trade_click = (kind: "buy" | "sell") => {
    if (auth_status === "authenticated") set_trade_dialog_kind(kind);
    else if (auth_status === "anonymous") set_auth_prompt_open(true);
  };

  // Real engine price-tick history — shared by the ribbon and the chart.
  const player_live_version = usePlayerLiveVersion(player.id);
  const [price_history, set_price_history] = useState<PricePoint[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    set_price_history(null);
    valuations_api
      // Cache-bust on open: a tick that landed BEFORE the sheet opened (e.g. a
      // goal the user just saw move the price in the list) must be in the chart
      // immediately — get_price_history would replay a stale cached history.
      // The live refetch keeps it current while the sheet stays open.
      .refresh_price_history(player.id)
      .then(points => {
        if (!cancelled) set_price_history(points);
      })
      .catch(() => {
        if (!cancelled) set_price_history([]);
      });
    return () => {
      cancelled = true;
    };
  }, [player.id]);
  // A new tick for this player refreshes the universe valuations, then
  // re-fetches this player's tick history (chained so order is deterministic).
  useLiveRefetch(player_live_version, () => {
    valuations_api
      .refresh()
      .then(() => valuations_api.refresh_price_history(player.id))
      .then(set_price_history)
      .catch(() => {
        /* keep the current curve / valuation on a transient error */
      });
  });

  const [tournament_stats, set_tournament_stats] = useState<PlayerTournamentStat | null | undefined>(undefined);
  // Left-column tab: Fixtures (default) vs Statistics.
  const [left_tab, set_left_tab] = useState<"fixtures" | "statistics">("fixtures");
  useEffect(() => {
    let cancelled = false;
    set_tournament_stats(undefined);
    set_left_tab("fixtures");
    players_api
      .get_tournament_stats(player.id)
      .then(stats => {
        if (!cancelled) set_tournament_stats(stats);
      })
      .catch(() => {
        if (!cancelled) set_tournament_stats(null);
      });
    return () => {
      cancelled = true;
    };
  }, [player.id]);

  // Sections reused by both the desktop two-pane layout and the single-column
  // phone layout (so the desktop render is unchanged and nothing is duplicated).
  const header = (
    <PlayerSheetHeader
      player={player}
      team={team}
      is_watched={is_watched}
      on_toggle_watch={() => toggle_watch?.(player.id)}
      on_open_team={on_open_team}
    />
  );

  const personal_card = (
    <SectionCard title="Personal">
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 0 }}>
        <SmallKpi label="Position" value={player.detailed_position ?? POSITION_LABEL[player.position]} mono={false} />
        <SmallKpi label="Age" value={String(player.age ?? "—")} />
        <SmallKpi label="Foot" value={player.foot ?? "—"} mono={false} />
        <SmallKpi label="Height" value={player.height ?? "—"} />
        <SmallKpi label="Weight" value={player.weight ?? "—"} />
      </div>
    </SectionCard>
  );

  // Tournament totals — a compact headline strip (same source/format as the
  // Statistics panel, via the shared key_tournament_stats). Always six cells;
  // "—" while loading / for a player who hasn't featured.
  const tournament_card = (
    <SectionCard title="Tournament">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 0 }}>
        {key_tournament_stats(tournament_stats, player.position).map(item => (
          <SmallKpi
            key={item.label}
            label={item.label}
            value={
              item.parts
                ? item.parts.map((p, i) => (
                    <span key={i} style={{ color: semantic_color(p.semantic) }}>
                      {p.text}
                    </span>
                  ))
                : item.value
            }
            color={item.parts ? undefined : semantic_color(item.semantic)}
            title={item.title}
          />
        ))}
      </div>
    </SectionCard>
  );

  // Skills — real provider tags only. No tags → no card (a synthesised skill
  // list would violate the data-sourcing rule).
  const skills_card =
    player.tags && player.tags.length > 0 ? (
      <SectionCard title="Skills">
        <div style={{ display: "flex", gap: 0, flexWrap: "wrap", background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.05)", padding: "6px" }}>
          {player.tags.map(t => (
            <span key={t} style={{ margin: 2, padding: "5px 10px", borderRadius: 5, fontSize: 12, fontWeight: 800, background: "rgba(255,255,255,.06)", color: "#fff", border: "1px solid rgba(255,255,255,.1)" }}>
              {t}
            </span>
          ))}
        </div>
      </SectionCard>
    ) : null;

  const buy_sell = (
    <div style={{ display: "flex", gap: 8 }}>
      <button
        onClick={() => handle_trade_click("buy")}
        style={{ flex: 1, padding: "13px 0", fontSize: 14, fontWeight: 800, borderRadius: 10, background: "var(--color-action-buy)", color: "#fff", border: "none", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 16px color-mix(in srgb, var(--color-positive) 25%, transparent)" }}
      >
        Buy
      </button>
      <button
        onClick={() => handle_trade_click("sell")}
        style={{ flex: 1, padding: "13px 0", fontSize: 14, fontWeight: 800, borderRadius: 10, background: "var(--color-action-sell)", color: "#fff", border: "none", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 16px color-mix(in srgb, var(--color-negative) 25%, transparent)" }}
      >
        Sell
      </button>
    </div>
  );

  // Fixtures | Statistics tab buttons (the long stat families live behind a tab
  // so they don't push the trade buttons off-screen).
  const tab_buttons = (
    <div style={{ display: "flex", gap: 4, padding: is_mobile ? 0 : "0 24px 8px", flexShrink: 0 }}>
      {(["fixtures", "statistics"] as const).map(tab => {
        const active = left_tab === tab;
        return (
          <button
            key={tab}
            onClick={() => set_left_tab(tab)}
            style={{ background: active ? "rgba(255,255,255,.06)" : "transparent", border: "1px solid rgba(255,255,255,.06)", color: active ? "#fff" : "rgba(255,255,255,.45)", padding: "4px 12px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", borderRadius: 5, cursor: "pointer", fontFamily: "inherit" }}
          >
            {tab === "fixtures" ? "Fixtures" : "Statistics"}
          </button>
        );
      })}
    </div>
  );

  const stats_block =
    tournament_stats === undefined ? (
      <div style={{ padding: "12px 2px", fontSize: 12, color: "rgba(255,255,255,.4)" }}>loading…</div>
    ) : tournament_stats === null ? (
      <div style={{ padding: "12px 2px", fontSize: 12, color: "rgba(255,255,255,.4)" }}>
        No stats yet — this player hasn&apos;t featured.
      </div>
    ) : (
      <PlayerStatistics stats={tournament_stats} embedded />
    );

  const ribbon = (
    <PlayerValuationRibbon
      player_id={player.id}
      current_price={current_price}
      performance_rating={performance_rating}
      tournament_stats={tournament_stats}
    />
  );

  // ── Phone: one scrolling column (the Sheet scrolls). The chart, the
  // Fixtures/Statistics tab and the match log are all visible — the desktop
  // two-pane layout hid the whole left column on a narrow screen. Buy/Sell
  // live in a sticky footer (mirrors the native PlayerSheet). ──
  if (is_mobile) {
    return (
      <Sheet open={true} on_close={on_close} max_width={1080} footer={buy_sell}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {header}
          <div style={{ padding: "16px 16px 8px", display: "flex", flexDirection: "column", gap: 16 }}>
            {ribbon}
            <PlayerPriceChart price_history={price_history} />
            {personal_card}
            {tournament_card}
            {skills_card}
            <YourPositionCard player={player} on_close_position={on_close_position} />
          </div>
          <div style={{ padding: "0 24px 8px" }}>{tab_buttons}</div>
          {left_tab === "fixtures" ? (
            <div style={{ height: 360, display: "flex", flexDirection: "column" }}>
              <PlayerMatchLog player_id={player.id} on_open_match={go_match} embedded />
            </div>
          ) : (
            <div style={{ padding: "0 24px 20px" }}>{stats_block}</div>
          )}
        </div>

        <TradeDialog
          open={trade_dialog_kind !== null}
          player={player}
          initial_kind={trade_dialog_kind ?? "buy"}
          on_close={() => set_trade_dialog_kind(null)}
          go_portfolio={() => {
            set_trade_dialog_kind(null);
            on_close();
            go_portfolio?.();
          }}
        />
        {auth_prompt_open && <AuthDialog initial_mode="register" on_close={() => set_auth_prompt_open(false)} />}
        {close_open && holding_metrics && (
          <ClosePositionsDialog open positions={[{ ...holding_metrics, player }]} on_close={() => set_close_open(false)} />
        )}
      </Sheet>
    );
  }

  return (
    <Sheet open={true} on_close={on_close} max_width={1080}>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", maxHeight: "92vh" }}>
        {header}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.4fr) minmax(380px, 1fr)",
            gridTemplateRows: "1fr",
            flex: 1,
            minHeight: 0,
          }}
        >
          {/* LEFT — valuation ribbon + chart (sticky), then the match log. */}
          <div
            style={{
              borderRight: "1px solid rgba(255,255,255,.06)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              minHeight: 0,
              height: "100%",
            }}
          >
            <div style={{ padding: "20px 24px 12px", display: "flex", flexDirection: "column", gap: 16, flexShrink: 0 }}>
              <PlayerValuationRibbon
                player_id={player.id}
                current_price={current_price}
                performance_rating={performance_rating}
                tournament_stats={tournament_stats}
              />
              <PlayerPriceChart price_history={price_history} />
            </div>

            {/* Fixtures | Statistics — tabbed so the (long) stat families don't
                push the trade buttons in the right column off-screen. */}
            <div style={{ display: "flex", gap: 4, padding: "0 24px 8px", flexShrink: 0 }}>
              {(["fixtures", "statistics"] as const).map(tab => {
                const active = left_tab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => set_left_tab(tab)}
                    style={{
                      background: active ? "rgba(255,255,255,.06)" : "transparent",
                      border: "1px solid rgba(255,255,255,.06)",
                      color: active ? "#fff" : "rgba(255,255,255,.45)",
                      padding: "4px 12px",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 0.5,
                      textTransform: "uppercase",
                      borderRadius: 5,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {tab === "fixtures" ? "Fixtures" : "Statistics"}
                  </button>
                );
              })}
            </div>

            {left_tab === "fixtures" ? (
              <PlayerMatchLog player_id={player.id} on_open_match={go_match} embedded />
            ) : (
              <div
                className="scroll-visible"
                style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 24px 20px" }}
              >
                {tournament_stats === undefined ? (
                  <div style={{ padding: "12px 2px", fontSize: 12, color: "rgba(255,255,255,.4)" }}>loading…</div>
                ) : tournament_stats === null ? (
                  <div style={{ padding: "12px 2px", fontSize: 12, color: "rgba(255,255,255,.4)" }}>
                    No stats yet — this player hasn&apos;t featured.
                  </div>
                ) : (
                  <PlayerStatistics stats={tournament_stats} embedded />
                )}
              </div>
            )}
          </div>

          {/* RIGHT — personal, skills, statistics, position, trade. */}
          <div
            style={{
              padding: "16px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              overflowY: "auto",
              maxHeight: "92vh",
            }}
          >
            <SectionCard title="Personal">
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 0 }}>
                <SmallKpi
                  label="Position"
                  value={player.detailed_position ?? POSITION_LABEL[player.position]}
                  mono={false}
                />
                <SmallKpi label="Age" value={String(player.age ?? "—")} />
                <SmallKpi label="Foot" value={player.foot ?? "—"} mono={false} />
                <SmallKpi label="Height" value={player.height ?? "—"} />
                <SmallKpi label="Weight" value={player.weight ?? "—"} />
              </div>
            </SectionCard>

            {tournament_card}

            {/* Skills — real provider tags only. No tags → no card (a
                synthesised skill list would violate the data-sourcing rule). */}
            {player.tags && player.tags.length > 0 && (
              <SectionCard title="Skills">
                <div
                  style={{
                    display: "flex",
                    gap: 0,
                    flexWrap: "wrap",
                    background: "rgba(255,255,255,.025)",
                    border: "1px solid rgba(255,255,255,.05)",
                    padding: "6px",
                  }}
                >
                  {player.tags.map(t => (
                    <span
                      key={t}
                      style={{
                        margin: 2,
                        padding: "5px 10px",
                        borderRadius: 5,
                        fontSize: 12,
                        fontWeight: 800,
                        background: "rgba(255,255,255,.06)",
                        color: "#fff",
                        border: "1px solid rgba(255,255,255,.1)",
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </SectionCard>
            )}

            <YourPositionCard player={player} on_close_position={on_close_position} />

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => handle_trade_click("buy")}
                style={{
                  flex: 1,
                  padding: "13px 0",
                  fontSize: 14,
                  fontWeight: 800,
                  borderRadius: 10,
                  background: "var(--color-action-buy)",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  boxShadow: "0 4px 16px color-mix(in srgb, var(--color-positive) 25%, transparent)",
                }}
              >
                Buy
              </button>
              <button
                onClick={() => handle_trade_click("sell")}
                style={{
                  flex: 1,
                  padding: "13px 0",
                  fontSize: 14,
                  fontWeight: 800,
                  borderRadius: 10,
                  background: "var(--color-action-sell)",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  boxShadow: "0 4px 16px color-mix(in srgb, var(--color-negative) 25%, transparent)",
                }}
              >
                Sell
              </button>
            </div>
          </div>
        </div>
      </div>

      <TradeDialog
        open={trade_dialog_kind !== null}
        player={player}
        initial_kind={trade_dialog_kind ?? "buy"}
        on_close={() => set_trade_dialog_kind(null)}
        go_portfolio={() => {
          set_trade_dialog_kind(null);
          on_close();
          go_portfolio?.();
        }}
      />
      {auth_prompt_open && <AuthDialog initial_mode="register" on_close={() => set_auth_prompt_open(false)} />}
    </Sheet>
  );
}
