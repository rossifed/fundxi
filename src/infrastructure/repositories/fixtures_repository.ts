import type { Fixture } from "@/domain/match/fixture";
import { api_get } from "@/infrastructure/api_client";

interface FixtureDTO {
  id: number;
  home_team_id: string;
  away_team_id: string;
  status: string;
  group: string;
  home_score: number | null;
  away_score: number | null;
  kickoff_at: string | null;
  minute: number | null;
  note: string | null;
}

let FIXTURES: Fixture[] = [];
let FIXTURES_BY_ID = new Map<number, Fixture>();

function dto_to_domain(dto: FixtureDTO): Fixture {
  return {
    id: dto.id,
    home_team_id: dto.home_team_id,
    away_team_id: dto.away_team_id,
    status: dto.status as Fixture["status"],
    group: dto.group,
    home_score: dto.home_score ?? undefined,
    away_score: dto.away_score ?? undefined,
    date: dto.kickoff_at ?? undefined,
    minute: dto.minute ?? undefined,
    note: dto.note ?? undefined,
  };
}

async function _load(): Promise<void> {
  const dtos = await api_get<FixtureDTO[]>("/api/fixtures");
  FIXTURES = dtos.map(dto_to_domain);
  FIXTURES_BY_ID = new Map(FIXTURES.map(f => [f.id, f]));
}

export async function init_fixtures_repository(): Promise<void> {
  await _load();
}

/** Re-fetch the fixtures list — status / clock / score may have changed
 * (e.g. a match just went live). Used by the live-update path. */
export async function refresh_fixtures(): Promise<void> {
  await _load();
}

export const fixtures_repository = {
  find_all(): Fixture[] {
    return FIXTURES;
  },
  find_by_id(id: number): Fixture | undefined {
    return FIXTURES_BY_ID.get(id);
  },
};
