import { useEffect, useState, type FormEvent } from "react";
import { color_for_sign } from "@/ui/helpers/format";
import { leagues_api } from "@/api/leagues_api";
import { subscribe_leagues } from "@/infrastructure/repositories/leagues_repository";
import { ApiError } from "@/infrastructure/api_client";
import { Avatar } from "@/ui/components/Avatar";
import { useAuth } from "@/ui/shell/AuthContext";
import type { League } from "@/domain/league/league";

type View = "board" | "create" | "join";

interface LeaguesPageProps {
  initial_join_code?: string | null;
}

export function LeaguesPage({ initial_join_code }: LeaguesPageProps = {}) {
  const { status } = useAuth();
  const [, force] = useState(0);
  const [view, set_view] = useState<View>(initial_join_code ? "join" : "board");
  const [active_id, set_active_id] = useState<string | null>(null);
  const [detail, set_detail] = useState<League | null>(null);
  const [detail_state, set_detail_state] = useState<"idle" | "loading" | "error">("idle");

  // Re-render when the cached summary list changes (after create/join).
  useEffect(() => subscribe_leagues(() => force(n => n + 1)), []);

  const summaries = leagues_api.list_summaries();
  const selected_id = active_id ?? summaries[0]?.id ?? null;

  // Fetch the full leaderboard for the selected league on demand.
  useEffect(() => {
    if (status !== "authenticated" || !selected_id) {
      set_detail(null);
      return;
    }
    let cancelled = false;
    set_detail_state("loading");
    leagues_api
      .detail(selected_id)
      .then(d => {
        if (cancelled) return;
        set_detail(d);
        set_detail_state("idle");
      })
      .catch(() => {
        if (cancelled) return;
        set_detail_state("error");
      });
    return () => {
      cancelled = true;
    };
  }, [selected_id, status]);

  if (status === "loading") {
    return <EmptyShell title="Loading…" body="Resolving your session." />;
  }
  if (status === "anonymous") {
    return (
      <EmptyShell
        title="Sign in to access leagues"
        body="Create a private league with friends or join one with an invite code. Sign in or create an account from the top right to get started."
      />
    );
  }

  if (view === "create") {
    return (
      <CreateLeagueView
        on_back={() => set_view("board")}
        on_created={league => {
          set_active_id(league.id);
          set_detail(league);
          set_view("board");
        }}
      />
    );
  }

  if (view === "join") {
    return (
      <JoinLeagueView
        initial_code={initial_join_code ?? ""}
        on_back={() => set_view("board")}
        on_joined={league => {
          set_active_id(league.id);
          set_detail(league);
          set_view("board");
        }}
      />
    );
  }

  if (summaries.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <EmptyShell
          title="No leagues yet"
          body="You are not in any league. Create a private league to compete with friends, or join one with an invite code."
        />
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <ActionButton label="+ Create league" primary on_click={() => set_view("create")} />
          <ActionButton label="Join with code" on_click={() => set_view("join")} />
        </div>
      </div>
    );
  }

  const me = detail?.leaderboard.find(e => e.is_me);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", flex: 1 }}>
          {summaries.map(l => {
            const active = l.id === selected_id;
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
                <span style={{ fontSize: 10, color: "rgba(255,255,255,.3)" }}>{l.member_count}</span>
              </button>
            );
          })}
        </div>
        <ActionButton label="+ Create" primary on_click={() => set_view("create")} />
        <ActionButton label="Join code" on_click={() => set_view("join")} />
      </div>

      {detail && (
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
            <div style={{ fontSize: 16, fontWeight: 800 }}>{detail.name}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.45)" }}>{detail.description}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 12 }}>
            <span style={{ color: "rgba(255,255,255,.35)" }}>
              {detail.member_count} {detail.is_public ? "players" : "members"}
            </span>
            {me && (
              <span style={{ color: "rgba(255,255,255,.55)" }}>
                You · <span className="mono" style={{ fontWeight: 700, color: "#fff" }}>#{me.rank}</span>
                <span style={{ color: "rgba(255,255,255,.35)" }}> / {detail.member_count}</span>
              </span>
            )}
            {!detail.is_public && detail.invite_code && (
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="mono" style={{ color: "var(--color-positive)", fontWeight: 700 }}>
                  {detail.invite_code}
                </span>
                <CopyButton text={detail.invite_code} label="Copy" />
                <CopyButton text={invite_link(detail.invite_code)} label="Copy link" />
              </span>
            )}
          </div>
        </div>
      )}

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
          <span style={{ fontSize: 11, color: "rgba(255,255,255,.35)" }}>
            {detail ? `${detail.leaderboard.length} ranked` : ""}
          </span>
        </div>

        {detail_state === "loading" && (
          <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 12, color: "rgba(255,255,255,.35)" }}>
            Loading leaderboard…
          </div>
        )}
        {detail_state === "error" && (
          <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 12, color: "var(--color-negative)" }}>
            Could not load this league.
          </div>
        )}

        {detail && detail_state === "idle" && (
          <>
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
            {detail.leaderboard.map(entry => (
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
                <span
                  className="mono"
                  style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.35)" }}
                >
                  {entry.rank}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Avatar seed={entry.name} name={entry.name} size={26} />
                  <span style={{ fontWeight: entry.is_me ? 700 : 500 }}>
                    {entry.name}
                    {entry.is_me && (
                      <span
                        style={{
                          fontSize: 10,
                          color: "var(--color-positive)",
                          marginLeft: 6,
                          fontWeight: 700,
                        }}
                      >
                        YOU
                      </span>
                    )}
                  </span>
                </span>
                <span className="mono" style={{ textAlign: "right", color: "rgba(255,255,255,.55)" }}>
                  €{entry.value.toLocaleString()}
                </span>
                <span
                  className="mono"
                  style={{
                    textAlign: "right",
                    fontWeight: 700,
                    color: color_for_sign(entry.return_pct),
                  }}
                >
                  {entry.return_pct >= 0 ? "+" : ""}
                  {entry.return_pct}%
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function CreateLeagueView({
  on_back,
  on_created,
}: {
  on_back: () => void;
  on_created: (league: League) => void;
}) {
  const [name, set_name] = useState("");
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const [created, set_created] = useState<League | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    set_busy(true);
    set_error(null);
    try {
      const league = await leagues_api.create(name.trim());
      set_created(league);
    } catch (err) {
      set_error(err instanceof ApiError ? err.message : "Could not create the league.");
    } finally {
      set_busy(false);
    }
  };

  if (created) {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", animation: "fu .2s ease" }}>
        <BackLink on_click={on_back} />
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>League created</div>
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
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", marginBottom: 4, letterSpacing: 0.5 }}>
              INVITE CODE
            </div>
            <div
              className="mono"
              style={{ fontSize: 28, fontWeight: 800, color: "var(--color-positive)", letterSpacing: 3 }}
            >
              {created.invite_code}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <CopyButton text={created.invite_code ?? ""} label="Copy code" full />
            <CopyButton text={invite_link(created.invite_code ?? "")} label="Copy invite link" full />
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.3)", marginBottom: 16, lineHeight: 1.5 }}>
            Share the link with a friend — opening it pre-fills the join screen
            (they still need an account to join).
          </div>
          <ActionButton label="Go to league" primary full on_click={() => on_created(created)} />
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ maxWidth: 480, margin: "0 auto", animation: "fu .2s ease" }}>
      <BackLink on_click={on_back} />
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Create private league</div>
      <input
        value={name}
        onChange={e => set_name(e.target.value)}
        placeholder="League name (e.g. Office League)"
        maxLength={64}
        style={text_input}
      />
      {error && <ErrorBanner message={error} />}
      <ActionButton
        label={busy ? "…" : "Create league"}
        primary
        full
        disabled={busy || !name.trim()}
        type="submit"
      />
    </form>
  );
}

function JoinLeagueView({
  initial_code,
  on_back,
  on_joined,
}: {
  initial_code: string;
  on_back: () => void;
  on_joined: (league: League) => void;
}) {
  const [code, set_code] = useState(initial_code);
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (code.trim().length < 4) return;
    set_busy(true);
    set_error(null);
    try {
      const league = await leagues_api.join(code.trim());
      on_joined(league);
    } catch (err) {
      set_error(err instanceof ApiError ? err.message : "Could not join the league.");
    } finally {
      set_busy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ maxWidth: 480, margin: "0 auto", animation: "fu .2s ease" }}>
      <BackLink on_click={on_back} />
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Join a league</div>
      <input
        value={code}
        onChange={e => set_code(e.target.value.toUpperCase())}
        placeholder="INVITE CODE"
        maxLength={16}
        style={{
          ...text_input,
          fontFamily: "'JetBrains Mono',monospace",
          fontWeight: 700,
          letterSpacing: 3,
          textAlign: "center",
          fontSize: 18,
        }}
      />
      {error && <ErrorBanner message={error} />}
      <ActionButton
        label={busy ? "…" : "Join league"}
        primary
        full
        disabled={busy || code.trim().length < 4}
        type="submit"
      />
    </form>
  );
}

function invite_link(code: string): string {
  if (typeof window === "undefined") return code;
  return `${window.location.origin}/?join=${encodeURIComponent(code)}`;
}

function CopyButton({
  text,
  label,
  full = false,
}: {
  text: string;
  label: string;
  full?: boolean;
}) {
  const [copied, set_copied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      set_copied(true);
      window.setTimeout(() => set_copied(false), 1800);
    } catch {
      // Clipboard blocked (insecure context / permission) — select-fallback
      // is overkill here; the code is visible on screen to copy by hand.
      set_copied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      style={{
        width: full ? "100%" : undefined,
        padding: full ? "12px 0" : "8px 12px",
        fontSize: 12,
        fontWeight: 700,
        borderRadius: 10,
        background: copied ? "rgba(55,255,99,.14)" : "rgba(255,255,255,.05)",
        color: copied ? "var(--color-positive)" : "rgba(255,255,255,.7)",
        border: copied ? "1px solid rgba(55,255,99,.3)" : "1px solid rgba(255,255,255,.08)",
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "background .12s, color .12s",
      }}
    >
      {copied ? "Copied!" : label}
    </button>
  );
}

function BackLink({ on_click }: { on_click: () => void }) {
  return (
    <button
      type="button"
      onClick={on_click}
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
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        padding: "10px 12px",
        background: "rgba(255,40,93,.1)",
        border: "1px solid rgba(255,40,93,.35)",
        borderRadius: 8,
        color: "var(--color-negative)",
        fontSize: 13,
        fontWeight: 600,
        marginBottom: 12,
      }}
    >
      {message}
    </div>
  );
}

function ActionButton({
  label,
  on_click,
  primary = false,
  full = false,
  disabled = false,
  type = "button",
}: {
  label: string;
  on_click?: () => void;
  primary?: boolean;
  full?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={on_click}
      disabled={disabled}
      style={{
        width: full ? "100%" : undefined,
        padding: full ? "13px 0" : "10px 14px",
        fontSize: full ? 13 : 12,
        fontWeight: 700,
        borderRadius: 10,
        background: primary
          ? disabled
            ? "rgba(255,255,255,.06)"
            : "var(--color-action-buy)"
          : "rgba(255,255,255,.04)",
        color: primary ? (disabled ? "rgba(255,255,255,.3)" : "#0d0d0f") : "rgba(255,255,255,.7)",
        border: primary ? "none" : "1px solid rgba(255,255,255,.06)",
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        flexShrink: 0,
      }}
    >
      {label}
    </button>
  );
}

const text_input: React.CSSProperties = {
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
};

interface EmptyShellProps {
  title: string;
  body: string;
}

function EmptyShell({ title, body }: EmptyShellProps) {
  return (
    <div
      style={{
        maxWidth: 520,
        margin: "60px auto 0",
        padding: "32px 28px",
        textAlign: "center",
        background: "rgba(255,255,255,.02)",
        border: "1px solid rgba(255,255,255,.05)",
        borderRadius: 16,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          background: "rgba(55,255,99,.08)",
          border: "1px solid rgba(55,255,99,.18)",
          color: "var(--color-positive)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22,
          fontWeight: 800,
          margin: "0 auto 14px",
        }}
      >
        ▲
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 8 }}>{title}</div>
      <div
        style={{
          fontSize: 13,
          color: "rgba(255,255,255,.5)",
          lineHeight: 1.6,
          maxWidth: 420,
          margin: "0 auto",
        }}
      >
        {body}
      </div>
    </div>
  );
}
