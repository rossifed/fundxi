import type { Trade } from "@/domain/portfolio/trade";
import { players_repository } from "@/infrastructure/repositories/players_repository";
import { teams_repository } from "@/infrastructure/repositories/teams_repository";
import { api_get } from "@/infrastructure/api_client";

interface TradeDTO {
  id: number;
  portfolio_id: number;
  player_id: number;
  kind: "buy" | "sell";
  shares: number;
  price: number;
  total: number;
  executed_at: string;
}

let _trades: Trade[] = [];

function dto_to_domain(dto: TradeDTO): Trade {
  const player = players_repository.find_by_id(dto.player_id);
  const team_id = player?.team_id ?? "";
  return {
    id: dto.id,
    kind: dto.kind,
    player_id: dto.player_id,
    player_name: player?.name ?? `#${dto.player_id}`,
    team_id,
    shares: dto.shares,
    price: dto.price,
    date: dto.executed_at.slice(0, 10),
    total: dto.total,
  };
}

export async function init_trades_repository(): Promise<void> {
  const dtos = await api_get<TradeDTO[]>("/api/trades");
  _trades = dtos.map(dto_to_domain);
  // Touch teams repo to keep the imports honest (TS would otherwise prune).
  void teams_repository.find_all;
}

export async function refresh_trades(): Promise<void> {
  await init_trades_repository();
}

export const trades_repository = {
  find_all(): Trade[] {
    return _trades;
  },
};
