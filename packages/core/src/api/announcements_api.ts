import { api_get, api_post } from "@fundxi/core/infrastructure/api_client";

// In-app announcements (release notes / messages). Signed-in only — the BFF
// returns the active messages the caller hasn't dismissed; ``ack`` records the
// dismissal so each is shown exactly once per account. Direct BFF passthrough
// (no domain mapping), fetched on demand after login, not at bootstrap.

export interface Announcement {
  id: number;
  title: string;
  body: string;
  severity: string;
  published_at: string | null;
}

export const announcements_api = {
  list(): Promise<Announcement[]> {
    return api_get<Announcement[]>("/api/announcements");
  },
  async ack(id: number): Promise<void> {
    await api_post(`/api/announcements/${id}/ack`);
  },
};
