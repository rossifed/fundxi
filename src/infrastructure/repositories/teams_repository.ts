import type { Team } from "@/domain/team/team";
import { flag_emoji } from "@/domain/team/flag_emoji";
import { api_get } from "@/infrastructure/api_client";

// Backend payload shape — the fields of FastAPI TeamResponse the UI uses.
interface TeamDTO {
  id: string;
  name: string;
  flag: string; // Sportmonks flag image URL
  color: string; // kit-derived accent; "" when a team has no kit data yet
  kind: string;
  continent: string | null;
  coach_name: string | null;
  coach_image_path: string | null;
  coach_nationality: string | null;
}

// team.color is always a hex (kit colours are hex literals, and consumers
// append an alpha pair, e.g. `${color}66`). This is the neutral sentinel
// used when a team has no kit-colour data yet — not a theme colour.
const NEUTRAL_TEAM_COLOR = "#3b4049";

let TEAMS: Team[] = [];
let TEAMS_BY_ID = new Map<string, Team>();

function dto_to_domain(dto: TeamDTO): Team {
  return {
    id: dto.id,
    name: dto.name,
    // The emoji is a presentational transform of the nation code; the
    // raster flag image is the provider value carried as flag_url.
    flag: flag_emoji(dto.id),
    flag_url: dto.flag || undefined,
    // Real kit-derived colour, or the neutral sentinel when a team has no
    // kit data yet (debutants before their first WC2026 match).
    color: dto.color || NEUTRAL_TEAM_COLOR,
    kind: dto.kind === "national" ? "national" : "club",
    continent: dto.continent ?? undefined,
    coach_name: dto.coach_name ?? undefined,
    coach_image_path: dto.coach_image_path ?? undefined,
    coach_nationality: dto.coach_nationality ?? undefined,
  };
}

export async function init_teams_repository(): Promise<void> {
  const dtos = await api_get<TeamDTO[]>("/api/teams");
  TEAMS = dtos.map(dto_to_domain);
  TEAMS_BY_ID = new Map(TEAMS.map(t => [t.id, t]));
}

export const teams_repository = {
  find_all(): Team[] {
    return TEAMS;
  },
  find_by_id(id: string): Team | undefined {
    return TEAMS_BY_ID.get(id);
  },
};
