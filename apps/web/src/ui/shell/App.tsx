import { useEffect, useState } from "react";
import { matches_api } from "@fundxi/core/api/matches_api";
import { players_api } from "@fundxi/core/api/players_api";
import { portfolio_api } from "@fundxi/core/api/portfolio_api";
import { teams_api } from "@fundxi/core/api/teams_api";
import type { Match } from "@fundxi/core/domain/match/match";
import type { Player } from "@fundxi/core/domain/player/player";
import type { Team } from "@fundxi/core/domain/team/team";
import { ambient_gradient } from "@/ui/design/tokens";
import { HomePage } from "@/ui/pages/home/HomePage";
import { ScreenerPage } from "@/ui/pages/screener/ScreenerPage";
import { FixturesPage } from "@/ui/pages/fixtures/FixturesPage";
import { PortfolioPage } from "@/ui/pages/portfolio/PortfolioPage";
import { LeaguesPage } from "@/ui/pages/leagues/LeaguesPage";
import { ProfilePage } from "@/ui/pages/profile/ProfilePage";
import { ResetPasswordPage } from "@/ui/pages/auth/ResetPasswordPage";
import { AuthDialog } from "@/ui/components/AuthDialog";
import { AnnouncementBanner } from "@/ui/components/AnnouncementBanner";
import { SurveyPrompt } from "@/ui/components/SurveyPrompt";
import { HowToPlay } from "@/ui/components/HowToPlay";
import { MatchView } from "@/ui/pages/match/MatchView";
import { TeamPage } from "@/ui/pages/team/TeamPage";
import { PlayerSheet } from "@/ui/pages/player/PlayerSheet";
import { useViewport } from "@/ui/hooks/use_viewport";
import { useTradeLockRefresh } from "@/ui/hooks/use_trade_lock";
import { useAuth } from "@/ui/shell/AuthContext";
import { Header } from "./Header";
import { LiveBar } from "./LiveBar";
import { PortfolioBar } from "./PortfolioBar";
import { Sidebar, NAV_TABS } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { RightRail } from "./RightRail";

type TabId = "home" | "screener" | "fixtures" | "portfolio" | "leagues" | "profile";

// The watchlist is the user's own picks (never seeded with mock ids). Persisted
// CLIENT-SIDE in localStorage, keyed per user, so it survives a refresh — same
// pattern as the Fixtures view-mode preference. This is a prototype store: it is
// per-browser, not cross-device, and NOT the server source of truth. A backend
// watchlist (per account, cross-device) is the future proper home.
const watchlist_key = (user_id: number): string => `fundxi:watchlist:${user_id}`;

function read_watchlist(user_id: number): Set<number> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(watchlist_key(user_id));
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? new Set(ids.filter((n): n is number => typeof n === "number")) : new Set();
  } catch {
    return new Set(); // corrupt / disabled storage — start empty, never crash
  }
}

function write_watchlist(user_id: number, ids: Set<number>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(watchlist_key(user_id), JSON.stringify([...ids]));
  } catch {
    /* quota exceeded / storage disabled — non-fatal, stays in memory for the session */
  }
}

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

// Detect the password-reset deep link (``/reset-password?token=…`` from the
// email). The token is NOT stripped here — it stays until the user finishes
// (success or cancel), then ``finish_reset`` clears the path + query.
function read_reset_token(): string | null {
  if (typeof window === "undefined") return null;
  if (window.location.pathname !== "/reset-password") return null;
  return new URLSearchParams(window.location.search).get("token");
}

export function App() {
  const { is_mobile, rail_ok } = useViewport();
  const { user } = useAuth();
  // Keep the live-trading locked-teams set fresh app-wide (drives disabled
  // trade buttons during matches). Mounted once here.
  useTradeLockRefresh();
  const [initial_join_code] = useState<string | null>(consume_join_code);
  const [reset_token, set_reset_token] = useState<string | null>(read_reset_token);
  const [show_login, set_show_login] = useState(false);
  const [tab, set_tab] = useState<TabId>(initial_join_code ? "leagues" : "home");
  const [selected_player, set_selected_player] = useState<Player | null>(null);
  const [selected_match, set_selected_match] = useState<Match | null>(null);
  const [selected_team, set_selected_team] = useState<Team | null>(null);
  const [watchlist, set_watchlist] = useState<Set<number>>(() => new Set());

  // Load the signed-in user's saved watchlist (and clear it on logout). Client
  // persistence only — see the note on watchlist_key above.
  useEffect(() => {
    set_watchlist(user ? read_watchlist(user.id) : new Set());
  }, [user]);

  const toggle_watch = (id: number) => {
    set_watchlist(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (user) write_watchlist(user.id, next);
      return next;
    });
  };

  // Bulk add (e.g. a screener result) — functional update so a single call adds
  // every id at once (a per-id loop over toggle_watch would lose all but the last).
  const add_watch_many = (ids: number[]) =>
    set_watchlist(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      if (user) write_watchlist(user.id, next);
      return next;
    });

  const navigate = (id: string) => {
    set_tab(id as TabId);
    set_selected_match(null);
    set_selected_team(null);
  };

  // Leave the reset flow: drop the token, restore a clean URL ("/") so a
  // refresh doesn't re-open it, and optionally pop the sign-in dialog.
  const finish_reset = ({ open_login }: { open_login: boolean }) => {
    set_reset_token(null);
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", "/");
    }
    set_show_login(open_login);
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

  // Reset deep link takes over the whole viewport — the user is anonymous
  // and there's nothing else to do on this screen.
  if (reset_token) {
    return <ResetPasswordPage token={reset_token} on_done={finish_reset} />;
  }

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
        watchlist={watchlist}
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
        add_watch_many={add_watch_many}
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
  // The rail is desktop-only chrome: shown on rail pages, but only when the
  // viewport is wide enough to carry it without crowding the content.
  const show_rail = rail_ok && !selected_match && !selected_team && PAGES_WITH_RAIL.includes(tab);

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
          visible through the dark page tint — shadows blend away. Desktop
          only: it exists to fill the empty side gutters around the centred
          column. On mobile the content is edge-to-edge so the image only
          shows as faint noise behind the surfaces — drop it there. */}
      {!is_mobile && (
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
      )}

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
        <Header on_logo_click={() => navigate("home")} on_open_profile={() => navigate("profile")} />
        <PortfolioBar on_click={() => navigate("portfolio")} />
        <LiveBar on_open_match={open_match_by_fixture_id} />

        <div style={{ display: "flex", flex: 1, alignItems: "stretch", minHeight: 0 }}>
          {!is_mobile && <Sidebar active_tab={tab} on_navigate={navigate} />}

          <main
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            {/* Extra bottom padding on mobile clears the fixed BottomNav. */}
            <div style={{ padding: is_mobile ? "16px 14px 96px" : "24px 32px 64px", width: "100%" }}>
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

      {is_mobile && <BottomNav active_tab={tab} on_navigate={navigate} />}

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

      {/* Opened after a successful password reset to sign in with the new
          password (the Header owns its own dialog for normal sign-in). */}
      {show_login && <AuthDialog initial_mode="login" on_close={() => set_show_login(false)} />}

      {/* Self-contained onboarding overlay (floating "?" + "How fundXI works"
          panel). Mounted once here; auto-opens on first visit, otherwise on
          demand. No data, no coupling — zero impact on the rest of the app. */}
      <HowToPlay />

      {/* Pushed release notes / messages for signed-in users (dismiss = ack,
          shown once per account). Mounted once; reads only when authenticated. */}
      <AnnouncementBanner />

      {/* Product-research questions for signed-in users (answer or skip, asked
          once per account). Mounted once; reads only when authenticated. */}
      <SurveyPrompt />
    </div>
  );
}
