import type { Player, Position } from "@/domain/player/player";
import { api_get } from "@/infrastructure/api_client";

interface PlayerDTO {
  id: number;
  name: string;
  jersey_number: number;
  team_id: string;
  position: string;
  full_name: string | null;
  age: number | null;
  foot: string | null;
  height: number | null;       // cm (int)
  weight: number | null;       // kg (int)
  club: string | null;
  bio: string | null;
  image_path: string | null;
  detailed_position: string | null;
  date_of_birth: string | null;
  birth_city: string | null;
  nationality_name: string | null;
  nationality_iso: string | null;
  nationality_flag_url: string | null;
}

let PLAYERS: Player[] = [];
let PLAYERS_BY_ID = new Map<number, Player>();

function dto_to_domain(dto: PlayerDTO): Player {
  return {
    id: dto.id,
    name: dto.name,
    jersey_number: dto.jersey_number,
    team_id: dto.team_id,
    position: dto.position as Position,
    full_name: dto.full_name ?? undefined,
    age: dto.age ?? undefined,
    foot: dto.foot ?? undefined,
    height: dto.height != null ? `${dto.height}cm` : undefined,
    weight: dto.weight != null ? `${dto.weight}kg` : undefined,
    club: dto.club ?? undefined,
    bio: dto.bio ?? undefined,
    image_path: dto.image_path ?? undefined,
    detailed_position: dto.detailed_position ?? undefined,
    date_of_birth: dto.date_of_birth ?? undefined,
    birth_city: dto.birth_city ?? undefined,
    nationality_name: dto.nationality_name ?? undefined,
    nationality_iso: dto.nationality_iso ?? undefined,
    nationality_flag_url: dto.nationality_flag_url ?? undefined,
  };
}

export async function init_players_repository(): Promise<void> {
  const dtos = await api_get<PlayerDTO[]>("/api/players");
  PLAYERS = dtos.map(dto_to_domain);
  PLAYERS_BY_ID = new Map(PLAYERS.map(p => [p.id, p]));
}

export const players_repository = {
  find_all(): Player[] {
    return PLAYERS;
  },
  find_by_id(id: number): Player | undefined {
    return PLAYERS_BY_ID.get(id);
  },
};
