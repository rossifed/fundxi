import { ApiError, api_get, api_post } from "@/infrastructure/api_client";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
}

export const auth_api = {
  /** Returns the authenticated user or ``null`` if the session is anonymous. */
  async me(): Promise<AuthUser | null> {
    try {
      const u = await api_get<AuthUser | null>("/api/auth/me");
      return u;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return null;
      throw e;
    }
  },
  async register(email: string, password: string, display_name?: string): Promise<AuthUser> {
    return api_post<AuthUser>("/api/auth/register", { email, password, display_name });
  },
  async login(email: string, password: string): Promise<AuthUser> {
    return api_post<AuthUser>("/api/auth/login", { email, password });
  },
  async logout(): Promise<void> {
    await api_post<{ status: string }>("/api/auth/logout");
  },
};
