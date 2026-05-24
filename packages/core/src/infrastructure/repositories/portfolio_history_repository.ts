/* portfolio_history_repository — adapter to GET /api/portfolio/history.
 *
 * DDD role: Adapter (driven). Single I/O surface for the portfolio
 * value curve. All math / persistence happens server-side (backend
 * application service ``PortfolioHistoryService`` + hypertable
 * ``valuation.portfolio_value_snapshot``). The frontend just consumes.
 *
 * Why no derivation here:
 *   The curve must be reconstructable identically on mobile and on the
 *   future native client. Logic + data live in the backend, not the
 *   UI. Cf. CLAUDE.md "Data Sourcing — NON-NEGOTIABLE".
 */

import { api_get } from "@fundxi/core/infrastructure/api_client";

export type HistoryRange = "24h" | "7d" | "30d" | "all";

export interface PortfolioHistoryPointDTO {
  ts: string;
  cash: number;
  holdings_value: number;
  value: number;
  pnl_vs_open: number;
}

export interface PortfolioHistoryDTO {
  portfolio_id: number;
  range: HistoryRange;
  points: PortfolioHistoryPointDTO[];
}

export async function fetch_portfolio_history(range: HistoryRange = "24h"): Promise<PortfolioHistoryDTO> {
  return api_get<PortfolioHistoryDTO>(`/api/portfolio/history?range=${range}`);
}
