import type { News } from "@fundxi/core/domain/news/news";
import { news_repository } from "@fundxi/core/infrastructure/repositories/news_repository";

export const news_api = {
  list(): News[] {
    return news_repository.find_all();
  },
};
