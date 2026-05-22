export type TeamKind = "national" | "club";

export interface Team {
  id: string;
  name: string;
  flag: string;        // emoji glyph — presentational, derived via flag_emoji()
  flag_url?: string;   // raster flag image (Sportmonks CDN)
  color: string;       // kit-derived accent (provider data); falls back to a
                       // neutral token string when no kit data exists yet
  kind: TeamKind;
  // Raw Sportmonks country continent (provider truth — no invented
  // confederation). The tournament group is a standings concept and is
  // read from the standings, not stored on the team.
  continent?: string;
  // Head coach — joined server-side from core.coach. Absent until ingested.
  coach_name?: string;
  coach_image_path?: string;
  coach_nationality?: string;
}
