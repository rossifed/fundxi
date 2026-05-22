import { useState } from "react";
import { matches_api } from "@/api/matches_api";
import { players_api } from "@/api/players_api";
import { portfolio_api } from "@/api/portfolio_api";
import { teams_api } from "@/api/teams_api";
import type { Match } from "@/domain/match/match";
import type { Player } from "@/domain/player/player";
import type { Team } from "@/domain/team/team";
import { ambient_gradient } from "@/ui/design/tokens";
import { HomePage } from "@/ui/pages/home/HomePage";
import { ScreenerPage } from "@/ui/pages/screener/ScreenerPage";
import { FixturesPage } from "@/ui/pages/fixtures/FixturesPage";
import { PortfolioPage } from "@/ui/pages/portfolio/PortfolioPage";
import { LeaguesPage } from "@/ui/pages/leagues/LeaguesPage";
import { ProfilePage } from "@/ui/pages/profile/ProfilePage";
import { MatchView } from "@/ui/pages/match/MatchView";
import { TeamPage } from "@/ui/pages/team/TeamPage";
import { PlayerSheet } from "@/ui/pages/player/PlayerSheet";
import { Header } from "./Header";
import { PortfolioBar } from "./PortfolioBar";
import { Sidebar, NAV_TABS } from "./Sidebar";
import { RightRail } from "./RightRail";

type TabId = "home" | "screener" | "fixtures" | "portfolio" | "leagues" | "profile";

const DEFAULT_WATCHLIST = new Set<number>([16, 7, 108, 148]);
const APP_MAX_WIDTH = 1800;

// Pages where the right rail adds value (live ticker, watchlist, movers).
// Hidden on Match View (full bleed) and Profile (settings, no need).
const PAGES_WITH_RAIL: TabId[] = ["home", "screener", "fixtures", "portfolio", "leagues"];

// Read a one-shot ``?join=CODE`` invite param, then strip it from the URL
// so a refresh doesn't replay it. Returns the code (uppercased) or null.
function consume_join_code(): string | null {
  if (typeof window === "undefined") return null;
  const code = new URLSearchParams(window.location.search).get("join");
  if (!code) return null;
  const url = new URL(window.location.href);
  url.searchParams.delete("join");
  window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  return code.trim().toUpperCase();
}

export function App() {
  const [initial_join_code] = useState<string | null>(consume_join_code);
  const [tab, set_tab] = useState<TabId>(initial_join_code ? "leagues" : "home");
  const [selected_player, set_selected_player] = useState<Player | null>(null);
  const [selected_match, set_selected_match] = useState<Match | null>(null);
  const [selected_team, set_selected_team] = useState<Team | null>(null);
  const [watchlist, set_watchlist] = useState<Set<number>>(DEFAULT_WATCHLIST);

  const toggle_watch = (id: number) => {
    const next = new Set(watchlist);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set_watchlist(next);
  };

  const navigate = (id: string) => {
    set_tab(id as TabId);
    set_selected_match(null);
    set_selected_team(null);
  };

  const open_player = (player: Player) => set_selected_player(player);
  const close_player = () => set_selected_player(null);

  // Open a team's page — clears any open match / player overlay so the
  // team page is the focused content (it replaces the content area).
  const open_team = (team_id: string) => {
    const t = teams_api.get(team_id);
    if (!t) return;
    set_selected_player(null);
    set_selected_match(null);
    set_selected_team(t);
  };

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
        on_open_team={open_team}
        go_portfolio={go_portfolio}
      />
    );
  } else if (selected_team) {
    content = (
      <TeamPage
        team={selected_team}
        on_open_player={(id: number) => {
          const p = players_api.get(id);
          if (p) set_selected_player(p);
        }}
        on_open_match={(m: Match) => {
          set_selected_team(null);
          set_selected_match(m);
        }}
        on_open_team={open_team}
        on_back={() => set_selected_team(null)}
      />
    );
  } else if (tab === "home") {
    content = (
      <HomePage
        on_open_player={open_player}
        on_navigate_tab={navigate}
        on_open_match={set_selected_match}
        on_open_team={open_team}
        watchlist={watchlist}
        toggle_watch={toggle_watch}
      />
    );
  } else if (tab === "screener") {
    content = (
      <ScreenerPage
        on_open_player={open_player}
        on_open_team={open_team}
        watchlist={watchlist}
        toggle_watch={toggle_watch}
      />
    );
  } else if (tab === "fixtures") {
    content = <FixturesPage on_open_match={set_selected_match} on_open_team={open_team} />;
  } else if (tab === "portfolio") {
    content = <PortfolioPage on_open_player={open_player} on_open_team={open_team} />;
  } else if (tab === "leagues") {
    content = <LeaguesPage initial_join_code={initial_join_code} />;
  } else {
    content = <ProfilePage on_navigate_tab={navigate} />;
  }

  const current_tab_label = tab === "profile" ? "Profile" : NAV_TABS.find(t => t.id === tab)?.label ?? "";
  const show_rail = !selected_match && !selected_team && PAGES_WITH_RAIL.includes(tab);

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
      {/* Faint full-screen WC backdrop. ``screen`` blend keeps only the
          bright parts of the image (gold trophy, stadium lights, sky)
          visible through the dark page tint — shadows blend away. */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundImage: "url('/wc-bg.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          opacity: 0.08,
          mixBlendMode: "screen",
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
        <PortfolioBar on_click={() => navigate("portfolio")} />

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
            <div style={{ padding: "24px 32px 64px", width: "100%" }}>
              {!selected_match && !selected_team && tab !== "home" && (
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
              on_open_team={open_team}
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
          on_open_team={open_team}
          watchlist={watchlist}
          toggle_watch={toggle_watch}
        />
      )}
    </div>
  );
}
