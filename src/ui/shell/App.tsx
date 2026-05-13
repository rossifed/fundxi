import { useMemo, useState } from "react";
import { matches_api } from "@/api/matches_api";
import { players_api } from "@/api/players_api";
import { portfolio_api } from "@/api/portfolio_api";
import type { Match } from "@/domain/match/match";
import type { Player } from "@/domain/player/player";
import { ambient_gradient } from "@/ui/design/tokens";
import { HomePage } from "@/ui/pages/home/HomePage";
import { ScreenerPage } from "@/ui/pages/screener/ScreenerPage";
import { FixturesPage } from "@/ui/pages/fixtures/FixturesPage";
import { PortfolioPage } from "@/ui/pages/portfolio/PortfolioPage";
import { LeaguesPage } from "@/ui/pages/leagues/LeaguesPage";
import { ProfilePage } from "@/ui/pages/profile/ProfilePage";
import { MatchView } from "@/ui/pages/match/MatchView";
import { PlayerSheet } from "@/ui/pages/player/PlayerSheet";
import { Header } from "./Header";
import { PortfolioBar } from "./PortfolioBar";
import { Sidebar, NAV_TABS } from "./Sidebar";
import { RightRail } from "./RightRail";

type TabId = "home" | "screener" | "fixtures" | "portfolio" | "leagues" | "profile";

const DEFAULT_WATCHLIST = new Set<number>([16, 7, 108, 148]);
const APP_MAX_WIDTH = 1600;

// Pages where the right rail adds value (live ticker, watchlist, movers).
// Hidden on Match View (full bleed) and Profile (settings, no need).
const PAGES_WITH_RAIL: TabId[] = ["home", "screener", "fixtures", "portfolio", "leagues"];

export function App() {
  const [tab, set_tab] = useState<TabId>("home");
  const [selected_player, set_selected_player] = useState<Player | null>(null);
  const [selected_match, set_selected_match] = useState<Match | null>(null);
  const [watchlist, set_watchlist] = useState<Set<number>>(DEFAULT_WATCHLIST);

  const toggle_watch = (id: number) => {
    const next = new Set(watchlist);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set_watchlist(next);
  };

  const totals = useMemo(() => portfolio_api.get_totals(), []);
  const holdings_count = useMemo(() => portfolio_api.get_holdings().length, []);

  const navigate = (id: string) => {
    set_tab(id as TabId);
    set_selected_match(null);
  };

  const open_player = (player: Player) => set_selected_player(player);
  const close_player = () => set_selected_player(null);

  const go_portfolio = () => {
    set_selected_player(null);
    set_selected_match(null);
    set_tab("portfolio");
  };

  const open_match_by_fixture_id = async (fixture_id: number) => {
    const m = await matches_api.get_match_by_fixture_id(fixture_id);
    if (!m) return;
    set_selected_player(null);
    set_selected_match(m);
  };

  let content: React.ReactNode;
  if (selected_match) {
    content = (
      <MatchView
        match={selected_match}
        on_back={() => set_selected_match(null)}
        on_open_player_profile={(id: number) => {
          const p = players_api.get(id);
          if (p) set_selected_player(p);
        }}
        go_portfolio={go_portfolio}
      />
    );
  } else if (tab === "home") {
    content = (
      <HomePage
        on_open_player={open_player}
        on_navigate_tab={navigate}
        on_open_match={set_selected_match}
        watchlist={watchlist}
        toggle_watch={toggle_watch}
      />
    );
  } else if (tab === "screener") {
    content = <ScreenerPage on_open_player={open_player} watchlist={watchlist} toggle_watch={toggle_watch} />;
  } else if (tab === "fixtures") {
    content = <FixturesPage on_open_match={set_selected_match} />;
  } else if (tab === "portfolio") {
    content = <PortfolioPage on_open_player={open_player} />;
  } else if (tab === "leagues") {
    content = <LeaguesPage />;
  } else {
    content = <ProfilePage on_navigate_tab={navigate} />;
  }

  const current_tab_label = tab === "profile" ? "Profile" : NAV_TABS.find(t => t.id === tab)?.label ?? "";
  const show_rail = !selected_match && PAGES_WITH_RAIL.includes(tab);

  return (
    <div
      style={{
        background: "#020406",
        color: "#fff",
        fontFamily: "'Inter',sans-serif",
        position: "relative",
        minHeight: "100vh",
      }}
    >
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: ambient_gradient,
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: APP_MAX_WIDTH,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
        }}
      >
        <Header on_logo_click={() => navigate("home")} />
        <PortfolioBar totals={totals} holdings_count={holdings_count} on_click={() => navigate("portfolio")} />

        <div style={{ display: "flex", flex: 1, alignItems: "stretch", minHeight: 0 }}>
          <Sidebar active_tab={tab} on_navigate={navigate} />

          <main
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            <div style={{ padding: "24px 32px 64px", maxWidth: 1200, width: "100%" }}>
              {!selected_match && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 24,
                  }}
                >
                  <h1
                    style={{
                      fontSize: 28,
                      fontWeight: 800,
                      letterSpacing: -0.6,
                    }}
                  >
                    {current_tab_label}
                  </h1>
                </div>
              )}
              {content}
            </div>
          </main>

          {show_rail && (
            <RightRail
              watchlist={watchlist}
              on_open_player={open_player}
              on_open_match={set_selected_match}
            />
          )}
        </div>
      </div>

      {selected_player && (
        <PlayerSheet
          player={selected_player}
          on_close={close_player}
          go_portfolio={go_portfolio}
          go_match={open_match_by_fixture_id}
          watchlist={watchlist}
          toggle_watch={toggle_watch}
        />
      )}
    </div>
  );
}
