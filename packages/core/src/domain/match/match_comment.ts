// Per-minute commentary on a match, sourced from Sportmonks. The same comment
// can be linked to multiple players via the backend mention table.

export interface MatchComment {
  id: number;
  fixture_id: number;
  minute: number;
  extra_minute?: number;
  comment: string;
  is_goal: boolean;
  is_important: boolean;
  sequence: number;
}
