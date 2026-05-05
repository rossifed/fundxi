import type { Team } from "@/domain/team/team";
import { api_get } from "@/infrastructure/api_client";
import { brand_for } from "@/infrastructure/branding/team_branding";

// Backend payload shape — matches FastAPI TeamResponse exactly.
interface TeamDTO {
  id: string;
  name: string;
  flag: string;          // Sportmonks URL — overridden with local emoji
  color: string;         // typically empty from backend — overridden
  kind: string;
  confederation: string | null;
  group: string | null;
}

let TEAMS: Team[] = [];
let TEAMS_BY_ID = new Map<string, Team>();

function dto_to_domain(dto: TeamDTO): Team {
  const brand = brand_for(dto.id);
  return {
    id: dto.id,
    name: dto.name,
    flag: brand.flag,
    color: brand.color,
    kind: (dto.kind === "national" ? "national" : "club"),
    confederation: (dto.confederation ?? brand.confederation) as Team["confederation"],
    group: dto.group ?? brand.group,
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
