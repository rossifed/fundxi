import { api_get, api_post } from "@fundxi/core/infrastructure/api_client";

// Product-research surveys. Signed-in only — the BFF returns the active
// questions the caller hasn't answered; ``answer`` stores the response (an
// empty payload = skip) so each question is asked exactly once per account.
// Direct BFF passthrough (no domain mapping), fetched on demand after login.

export interface SurveyQuestion {
  id: number;
  code: string;
  title: string;
  body: string | null;
  kind: string; // 'yes_no' | 'yes_no_amount' | 'text'
  published_at: string | null;
}

export interface SurveyAnswer {
  answer_bool?: boolean;
  answer_amount?: number;
  answer_text?: string;
}

export const surveys_api = {
  list(): Promise<SurveyQuestion[]> {
    return api_get<SurveyQuestion[]>("/api/surveys");
  },
  async answer(id: number, payload: SurveyAnswer): Promise<void> {
    await api_post(`/api/surveys/${id}/answer`, payload);
  },
  async skip(id: number): Promise<void> {
    await api_post(`/api/surveys/${id}/answer`, {});
  },
};
