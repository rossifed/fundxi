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
