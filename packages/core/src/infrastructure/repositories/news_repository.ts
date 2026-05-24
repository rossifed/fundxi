import type { News, NewsType } from "@fundxi/core/domain/news/news";
import { api_get } from "@fundxi/core/infrastructure/api_client";
import { fixtures_repository } from "@fundxi/core/infrastructure/repositories/fixtures_repository";
import { teams_repository } from "@fundxi/core/infrastructure/repositories/teams_repository";

interface NewsDTO {
  id: number;
  fixture_id: number | null;
  league_id: number | null;
  title: string;
  type: string;
  published_at: string | null;
}

let NEWS: News[] = [];

function fixture_label(fixture_id: number | null | undefined): string | undefined {
  if (!fixture_id) return undefined;
  const f = fixtures_repository.find_by_id(fixture_id);
  if (!f) return undefined;
  const home = teams_repository.find_by_id(f.home_team_id);
  const away = teams_repository.find_by_id(f.away_team_id);
  if (!home || !away) return undefined;
  return `${home.flag} ${home.id} vs ${away.flag} ${away.id}`;
}

function dto_to_domain(dto: NewsDTO): News {
  return {
    id: dto.id,
    fixture_id: dto.fixture_id ?? undefined,
    league_id: dto.league_id ?? undefined,
    title: dto.title,
    type: (dto.type === "postmatch" ? "postmatch" : "prematch") as NewsType,
    published_at: dto.published_at ?? undefined,
    fixture_label: fixture_label(dto.fixture_id),
  };
}

export async function init_news_repository(): Promise<void> {
  // News repo depends on fixtures + teams being already populated, so it
  // must run AFTER those in the bootstrap orchestrator.
  const dtos = await api_get<NewsDTO[]>("/api/news", { limit: 30 });
  NEWS = dtos.map(dto_to_domain);
}

export const news_repository = {
  find_all(): News[] {
    return NEWS;
  },
};
