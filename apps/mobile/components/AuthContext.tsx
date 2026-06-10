// AuthContext — current-user source of truth. RN port of
// apps/web/src/ui/shell/AuthContext.tsx (same logic; no DOM).
//
// Auth network calls live in @fundxi/core (`auth_api`), so this is a thin
// React wrapper. The session rides on the cookie that RN's native fetch
// persists (api_client uses `credentials: "include"`) — no bearer token,
// no secure-store. Adds `prompt()` so any screen can open the sign-in sheet,
// which AuthProvider renders once at the root.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { auth_api, type AuthUser } from "@fundxi/core/api/auth_api";
import { ApiError } from "@fundxi/core/infrastructure/api_client";
import { init_authenticated_repositories } from "@fundxi/core/infrastructure/repositories/init";
import { clear_leagues } from "@fundxi/core/infrastructure/repositories/leagues_repository";

import { AuthSheet } from "@/components/AuthSheet";

type Status = "loading" | "anonymous" | "authenticated";

interface AuthState {
  user: AuthUser | null;
  status: Status;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, display_name?: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Open the sign-in / sign-up sheet (e.g. when an anonymous user trades). */
  prompt: (mode?: "login" | "register") => void;
}

const AuthCtx = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, set_user] = useState<AuthUser | null>(null);
  const [status, set_status] = useState<Status>("loading");
  const [sheet_open, set_sheet_open] = useState(false);
  const [sheet_mode, set_sheet_mode] = useState<"login" | "register">("login");

  const apply_user = useCallback(async (u: AuthUser | null) => {
    set_user(u);
    if (u) {
      try {
        await init_authenticated_repositories();
      } catch (e) {
        // Only a genuine auth failure (401/403) means we are NOT logged in. A
        // data/infra error (500/503/network) must not log the user out — login /
        // me already proved the session; each screen surfaces its own load error.
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          set_user(null);
          set_status("anonymous");
          return;
        }
      }
      set_status("authenticated");
    } else {
      set_status("anonymous");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    auth_api
      .me()
      .then(u => {
        if (!cancelled) void apply_user(u);
      })
      .catch(() => {
        if (!cancelled) set_status("anonymous");
      });
    return () => {
      cancelled = true;
    };
  }, [apply_user]);

  const login = useCallback(
    async (email: string, password: string) => {
      await apply_user(await auth_api.login(email, password));
    },
    [apply_user],
  );
  const register = useCallback(
    async (email: string, password: string, display_name?: string) => {
      await apply_user(await auth_api.register(email, password, display_name));
    },
    [apply_user],
  );
  const logout = useCallback(async () => {
    await auth_api.logout();
    clear_leagues();
    set_user(null);
    set_status("anonymous");
  }, []);

  const prompt = useCallback((mode: "login" | "register" = "login") => {
    set_sheet_mode(mode);
    set_sheet_open(true);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, status, login, register, logout, prompt }}>
      {children}
      <AuthSheet
        visible={sheet_open}
        initial_mode={sheet_mode}
        on_close={() => set_sheet_open(false)}
        login={login}
        register={register}
      />
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth() outside <AuthProvider>");
  return ctx;
}
