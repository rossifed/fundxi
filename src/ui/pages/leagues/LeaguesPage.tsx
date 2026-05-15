import { useState } from "react";
import { leagues_api } from "@/api/leagues_api";
import { Avatar } from "@/ui/components/Avatar";

type View = "board" | "create" | "join";

export function LeaguesPage() {
  const [active_id, set_active_id] = useState("global");
  const [view, set_view] = useState<View>("board");
  const [create_name, set_create_name] = useState("");
  const [join_code, set_join_code] = useState("");
  const [created, set_created] = useState<{ name: string; code: string } | null>(null);

  const all_leagues = leagues_api.list();
  const league = leagues_api.get(active_id) ?? all_leagues[0];

  if (view === "create") {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", animation: "fu .2s ease" }}>
        <button
          onClick={() => set_view("board")}
          style={{
            background: "transparent",
            border: "none",
            color: "rgba(255,255,255,.45)",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            padding: 0,
            marginBottom: 18,
          }}
        >
          ← Back
        </button>
        {created ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>League Created!</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.35)", marginBottom: 16 }}>
              {created.name} is ready. Share the code with your friends.
            </div>
            <div
              style={{
                background: "rgba(55,255,99,.08)",
                border: "1px solid rgba(55,255,99,.18)",
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", marginBottom: 4, letterSpacing: 0.5 }}>INVITE CODE</div>
              <div className="mono" style={{ fontSize: 28, fontWeight: 800, color: "var(--color-positive)", letterSpacing: 3 }}>
                {created.code}
              </div>
            </div>
            <button
              onClick={() => {
                set_created(null);
                set_view("board");
              }}
              style={{
                width: "100%",
                padding: "12px 0",
                fontSize: 13,
                fontWeight: 700,
                borderRadius: 10,
                background: "rgba(255,255,255,.08)",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Go to League
            </button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Create private league</div>
            <input
              value={create_name}
              onChange={e => set_create_name(e.target.value)}
              placeholder="League name (e.g. La Bande, Office League)"
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 10,
                background: "rgba(255,255,255,.04)",
                border: "1px solid rgba(255,255,255,.06)",
                color: "#fff",
                fontSize: 14,
                fontFamily: "'Inter',sans-serif",
                outline: "none",
                marginBottom: 16,
              }}
            />
            <button
              onClick={() => {
                if (create_name.trim()) {
                  set_created({
                    name: create_name,
                    code:
                      create_name.slice(0, 4).toUpperCase().replace(/\s/g, "") +
                      Math.floor(Math.random() * 900 + 100),
                  });
                }
              }}
              disabled={!create_name.trim()}
              style={{
                width: "100%",
                padding: "13px 0",
                fontSize: 13,
                fontWeight: 700,
                borderRadius: 10,
                background: create_name.trim() ? "linear-gradient(135deg,var(--color-positive),#00c853)" : "rgba(255,255,255,.04)",
                color: create_name.trim() ? "#fff" : "rgba(255,255,255,.2)",
                border: "none",
                cursor: create_name.trim() ? "pointer" : "default",
                fontFamily: "inherit",
              }}
            >
              Create League
            </button>
          </div>
        )}
      </div>
    );
  }

  if (view === "join") {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", animation: "fu .2s ease" }}>
        <button
          onClick={() => set_view("board")}
          style={{
            background: "transparent",
            border: "none",
            color: "rgba(255,255,255,.45)",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            padding: 0,
            marginBottom: 18,
          }}
        >
          ← Back
        </button>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Join a league</div>
        <input
          value={join_code}
          onChange={e => set_join_code(e.target.value.toUpperCase())}
          placeholder="INVITE CODE"
          maxLength={10}
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 10,
            background: "rgba(255,255,255,.04)",
            border: "1px solid rgba(255,255,255,.06)",
            color: "#fff",
            fontSize: 18,
            fontFamily: "'JetBrains Mono',monospace",
            fontWeight: 700,
            letterSpacing: 3,
            textAlign: "center",
            outline: "none",
            marginBottom: 16,
          }}
        />
        <button
          onClick={() => set_view("board")}
          disabled={join_code.length < 4}
          style={{
            width: "100%",
            padding: "13px 0",
            fontSize: 13,
            fontWeight: 700,
            borderRadius: 10,
            background: join_code.length >= 4 ? "linear-gradient(135deg,var(--color-positive),#16a34a)" : "rgba(255,255,255,.04)",
            color: join_code.length >= 4 ? "#fff" : "rgba(255,255,255,.2)",
            border: "none",
            cursor: join_code.length >= 4 ? "pointer" : "default",
            fontFamily: "inherit",
          }}
        >
          Join League
        </button>
      </div>
    );
  }

  const me = league.leaderboard.find(e => e.is_me);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* League selector + actions */}
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", flex: 1 }}>
          {all_leagues.map(l => {
            const active = l.id === active_id;
            return (
              <button
                key={l.id}
                onClick={() => set_active_id(l.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 14px",
                  borderRadius: 10,
                  border: active ? "1px solid rgba(255,255,255,.2)" : "1px solid rgba(255,255,255,.06)",
                  background: active ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.02)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  flexShrink: 0,
                  color: active ? "#fff" : "rgba(255,255,255,.45)",
                }}
              >
                <Avatar seed={l.id} name={l.name} size={22} />
                <span style={{ fontSize: 12, fontWeight: active ? 700 : 500 }}>{l.name}</span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,.3)" }}>
                  {l.member_count}
                </span>
              </button>
            );
          })}
        </div>
        <button
          onClick={() => set_view("create")}
          style={{
            padding: "10px 14px",
            fontSize: 12,
            fontWeight: 700,
            borderRadius: 10,
            background: "rgba(255,255,255,.06)",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          + Create
        </button>
        <button
          onClick={() => set_view("join")}
          style={{
            padding: "10px 14px",
            fontSize: 12,
            fontWeight: 700,
            borderRadius: 10,
            background: "rgba(255,255,255,.02)",
            color: "rgba(255,255,255,.55)",
            border: "1px solid rgba(255,255,255,.06)",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Join code
        </button>
      </div>

      {/* League header (compact, full width) */}
      <div
        style={{
          background: "rgba(255,255,255,.025)",
          border: "1px solid rgba(255,255,255,.05)",
          borderRadius: 12,
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{league.name}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.45)" }}>{league.description}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 12 }}>
          <span style={{ color: "rgba(255,255,255,.35)" }}>
            {league.member_count} {league.is_public ? "players" : "members"}
          </span>
          {me && (
            <span style={{ color: "rgba(255,255,255,.55)" }}>
              You · <span className="mono" style={{ fontWeight: 700, color: "#fff" }}>#{me.rank}</span>
              <span style={{ color: "rgba(255,255,255,.35)" }}> / {league.member_count}</span>
            </span>
          )}
          {!league.is_public && league.invite_code && (
            <span className="mono" style={{ color: "var(--color-positive)", fontWeight: 700 }}>{league.invite_code}</span>
          )}
        </div>
      </div>

      {/* Leaderboard (full width) */}
      <div
          style={{
            background: "rgba(255,255,255,.02)",
            border: "1px solid rgba(255,255,255,.04)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid rgba(255,255,255,.05)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700 }}>Leaderboard</span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,.35)" }}>{league.leaderboard.length} ranked</span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "40px 1fr 110px 90px",
              padding: "8px 16px",
              borderBottom: "1px solid rgba(255,255,255,.04)",
              fontSize: 10,
              fontWeight: 700,
              color: "rgba(255,255,255,.35)",
              letterSpacing: 0.5,
              textTransform: "uppercase",
              gap: 8,
            }}
          >
            <span>Rank</span>
            <span>Trader</span>
            <span style={{ textAlign: "right" }}>Value</span>
            <span style={{ textAlign: "right" }}>Return</span>
          </div>
          {league.leaderboard.map(entry => (
            <div
              key={entry.rank}
              style={{
                display: "grid",
                gridTemplateColumns: "40px 1fr 110px 90px",
                padding: "10px 16px",
                borderBottom: "1px solid rgba(255,255,255,.025)",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                background: entry.is_me ? "rgba(55,255,99,.04)" : "transparent",
              }}
            >
              <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.35)" }}>
                {entry.rank}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Avatar seed={entry.name} name={entry.name} size={26} />
                <span style={{ fontWeight: entry.is_me ? 700 : 500 }}>
                  {entry.name}
                  {entry.is_me && <span style={{ fontSize: 10, color: "var(--color-positive)", marginLeft: 6, fontWeight: 700 }}>YOU</span>}
                </span>
              </span>
              <span className="mono" style={{ textAlign: "right", color: "rgba(255,255,255,.55)" }}>
                €{entry.value.toLocaleString()}
              </span>
              <span className="mono" style={{ textAlign: "right", fontWeight: 700, color: entry.return_pct >= 0 ? "var(--color-positive)" : "var(--color-negative)" }}>
                {entry.return_pct >= 0 ? "+" : ""}{entry.return_pct}%
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
