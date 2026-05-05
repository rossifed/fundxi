import type { News } from "@/domain/news/news";
import { news_repository } from "@/infrastructure/repositories/news_repository";

export const news_api = {
  list(): News[] {
    return news_repository.find_all();
  },
};
