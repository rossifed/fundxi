// News domain — Sportmonks-sourced article tied (optionally) to a fixture.

export type NewsType = "prematch" | "postmatch";

export interface News {
  id: number;
  fixture_id?: number;
  league_id?: number;
  title: string;
  type: NewsType;
  published_at?: string;
  // Optional enrichment computed in the repo from cached fixtures/teams:
  // pretty label like "🇫🇷 France vs 🇦🇷 Argentina" so the UI doesn't need to
  // know about the relationships.
  fixture_label?: string;
}
