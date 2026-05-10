export type TeamKind = "national" | "club";

export type Confederation = "UEFA" | "CONMEBOL" | "CONCACAF" | "AFC" | "CAF" | "OFC";

export interface Team {
  id: string;
  name: string;
  flag: string;        // emoji
  flag_url?: string;   // raster image (Sportmonks CDN — to be cached locally / S3 later)
  color: string;
  kind: TeamKind;
  // Specific to international competitions — only set for national teams in a tournament
  confederation?: Confederation;
  group?: string;
}
