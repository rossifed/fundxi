export interface LeagueEntry {
  rank: number;
  name: string;
  value: number;
  return_pct: number;
  avatar: string;
  pnl?: number;
  is_me?: boolean;
}

export interface League {
  id: string;
  name: string;
  icon: string;
  description: string;
  member_count: number;
  is_public: boolean;
  invite_code?: string;
  leaderboard: LeagueEntry[];
}

/** Lightweight row for the league list / tabs — no leaderboard payload.
 * The full ``League`` (with leaderboard) is fetched on demand for the
 * selected league only. */
export interface LeagueSummary {
  id: string;
  name: string;
  icon: string;
  description: string;
  member_count: number;
  is_public: boolean;
  invite_code?: string;
  my_rank: number;
  my_return_pct: number;
}
