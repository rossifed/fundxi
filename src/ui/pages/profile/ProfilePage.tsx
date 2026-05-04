import { useState } from "react";
import { teams_api } from "@/api/teams_api";

interface ProfilePageProps {
  on_navigate_tab: (tab: string) => void;
}

const SETTINGS = [
  { icon: "🔔", label: "Notifications", value: "On" },
  { icon: "🌙", label: "Dark Mode", value: "Always" },
  { icon: "💱", label: "Currency", value: "EUR €" },
  { icon: "📊", label: "Default Chart Period", value: "30D" },
  { icon: "🔒", label: "Privacy", value: "Friends only" },
];

const TRADING_STATS = {
  joined: "Jun 11, 2026",
  trades: 47,
  win_rate: "68%",
  best_trade: "+12.4%",
  streak: "5 wins",
  leagues: "4",
};

export function ProfilePage({ on_navigate_tab }: ProfilePageProps) {
  const [name, set_name] = useState("Alex M.");
  const [email] = useState("alex@fundxi.io");
  const [favorite_team_id, set_favorite_team_id] = useState("FRA");
  const [favorite_player] = useState("Mbappé");
  const [edit_mode, set_edit_mode] = useState(false);
  const [show_team_picker, set_show_team_picker] = useState(false);

  const all_teams = teams_api.list();
  const favorite_team = teams_api.get(favorite_team_id);

  return (
    <div style={{ padding: "0 20px 32px" }}>
      {/* Avatar + name */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <div
          style={{
            width: 60, height: 60, borderRadius: 18, background: "rgba(255,255,255,.08)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, fontWeight: 800, color: "#fff",
            border: "2px solid rgba(55,255,99,.3)", flexShrink: 0,
          }}
        >
          {name.split(" ").map(w => w[0]).join("")}
        </div>
        <div style={{ flex: 1 }}>
          {edit_mode ? (
            <input
              value={name}
              onChange={e => set_name(e.target.value)}
              style={{
                width: "100%", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)",
                borderRadius: 10, padding: "8px 12px", color: "#fff", fontSize: 17, fontWeight: 700,
                fontFamily: "inherit", outline: "none",
              }}
            />
          ) : (
            <div style={{ fontSize: 20, fontWeight: 800 }}>{name}</div>
          )}
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.25)", marginTop: 3 }}>{email}</div>
        </div>
        <button
          onClick={() => set_edit_mode(!edit_mode)}
          style={{
            padding: "8px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
            border: "1px solid rgba(255,255,255,.06)",
            background: edit_mode ? "rgba(55,255,99,.12)" : "rgba(255,255,255,.04)",
            color: edit_mode ? "#37ff63" : "rgba(255,255,255,.35)",
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          {edit_mode ? "Done" : "Edit"}
        </button>
      </div>

      {/* Favorites */}
      <div
        style={{
          background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)",
          borderRadius: 16, padding: "16px", marginBottom: 20,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Favorites</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <div
            onClick={() => set_show_team_picker(!show_team_picker)}
            style={{
              flex: 1, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)",
              borderRadius: 12, padding: "12px", cursor: "pointer",
            }}
          >
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.25)", marginBottom: 4 }}>TEAM</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 22 }}>{favorite_team?.flag}</span>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{favorite_team?.name}</span>
            </div>
          </div>
          <div
            style={{
              flex: 1, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)",
              borderRadius: 12, padding: "12px",
            }}
          >
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.25)", marginBottom: 4 }}>PLAYER</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>⭐ {favorite_player}</div>
          </div>
        </div>
        {show_team_picker && (
          <div
            style={{
              background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)",
              borderRadius: 12, padding: "10px", maxHeight: 200, overflowY: "auto", marginTop: 4,
            }}
          >
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {all_teams.map(team => {
                const on = favorite_team_id === team.id;
                return (
                  <button
                    key={team.id}
                    onClick={() => {
                      set_favorite_team_id(team.id);
                      set_show_team_picker(false);
                    }}
                    style={{
                      padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: on ? 700 : 500,
                      border: on ? "1px solid rgba(55,255,99,.3)" : "1px solid rgba(255,255,255,.05)",
                      background: on ? "rgba(55,255,99,.15)" : "rgba(255,255,255,.02)",
                      color: on ? "#37ff63" : "rgba(255,255,255,.35)",
                      cursor: "pointer", fontFamily: "inherit",
                      display: "flex", alignItems: "center", gap: 4, minHeight: 36,
                    }}
                  >
                    <span style={{ fontSize: 15 }}>{team.flag}</span>
                    {team.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Trading stats */}
      <div
        style={{
          background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)",
          borderRadius: 16, padding: "16px", marginBottom: 20,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Trading Stats</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
          {[
            { label: "Joined", value: TRADING_STATS.joined },
            { label: "Trades", value: String(TRADING_STATS.trades) },
            { label: "Win Rate", value: TRADING_STATS.win_rate, color: "#37ff63" },
            { label: "Best Trade", value: TRADING_STATS.best_trade, color: "#37ff63" },
            { label: "Streak", value: TRADING_STATS.streak, color: "rgba(255,255,255,.5)" },
            { label: "Leagues", value: TRADING_STATS.leagues, color: "#37ff63" },
          ].map((s, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,.02)", borderRadius: 10, padding: "10px", textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.25)" }}>{s.label}</div>
              <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: s.color ?? "#fff", marginTop: 3 }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Settings */}
      <div
        style={{
          background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)",
          borderRadius: 16, overflow: "hidden", marginBottom: 20,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
          Settings
        </div>
        {SETTINGS.map((s, i) => (
          <div
            key={i}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 16px",
              borderBottom: i < SETTINGS.length - 1 ? "1px solid rgba(255,255,255,.04)" : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>{s.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{s.label}</span>
            </div>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,.25)" }}>{s.value} ▸</span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          onClick={() => on_navigate_tab("leagues")}
          style={{
            width: "100%", padding: "14px 0", fontSize: 13, fontWeight: 700, borderRadius: 12,
            background: "rgba(55,255,99,.08)", color: "#37ff63",
            border: "1px solid rgba(55,255,99,.12)", cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Manage Leagues
        </button>
        <button
          style={{
            width: "100%", padding: "14px 0", fontSize: 13, fontWeight: 600, borderRadius: 12,
            background: "rgba(255,255,255,.03)", color: "rgba(255,255,255,.25)",
            border: "1px solid rgba(255,255,255,.04)", cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Help & Support
        </button>
        <button
          style={{
            width: "100%", padding: "14px 0", fontSize: 13, fontWeight: 600, borderRadius: 12,
            background: "rgba(255,255,255,.04)", color: "rgba(255,255,255,.35)",
            border: "1px solid rgba(255,255,255,.06)", cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Log Out
        </button>
      </div>
    </div>
  );
}
