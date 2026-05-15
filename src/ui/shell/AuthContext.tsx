/* AuthContext — single source of truth for the current user.
 *
 * Behaviour:
 *   - On mount, calls ``/api/auth/me``. ``null`` ⇒ anonymous browse mode.
 *   - ``login`` / ``register`` set the user and bootstrap the auth-only
 *     repositories (portfolio, trades).
 *   - ``logout`` clears the cookie via the BFF and resets state.
 *
 * Consumers: ``useAuth()``. The BootstrapGate primes the public repos
 * BEFORE this provider takes over, so children can render without
 * waiting on auth resolution. */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { auth_api, type AuthUser } from "@/api/auth_api";
import { init_authenticated_repositories } from "@/infrastructure/repositories/init";

interface AuthState {
  user: AuthUser | null;
  status: "loading" | "anonymous" | "authenticated";
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, display_name?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, set_user] = useState<AuthUser | null>(null);
  const [status, set_status] = useState<AuthState["status"]>("loading");

  const apply_user = useCallback(async (u: AuthUser | null) => {
    set_user(u);
    if (u) {
      try {
        await init_authenticated_repositories();
      } catch {
        // Stale cookie / network blip — drop to anonymous rather than
        // leaving the app in a broken half-authed state.
        set_user(null);
        set_status("anonymous");
        return;
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
      const u = await auth_api.login(email, password);
      await apply_user(u);
    },
    [apply_user],
  );
  const register = useCallback(
    async (email: string, password: string, display_name?: string) => {
      const u = await auth_api.register(email, password, display_name);
      await apply_user(u);
    },
    [apply_user],
  );
  const logout = useCallback(async () => {
    await auth_api.logout();
    set_user(null);
    set_status("anonymous");
  }, []);

  return <AuthCtx.Provider value={{ user, status, login, register, logout }}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth() outside <AuthProvider>");
  return ctx;
}
