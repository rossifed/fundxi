/* close_positions — batch liquidation of open positions.
 *
 * DDD role: Application Service / Use Case.
 *
 * Pure orchestration: the actual trade execution is injected as a
 * ``TradeExecutor``, so this module stays free of any HTTP /
 * infrastructure concern and is unit-testable with a fake executor.
 * The api/ layer wires the real executor (see ``trades_api``).
 */

/** One position to liquidate, flattened to zero at its current market
 * price. ``shares`` is the SIGNED held quantity — positive for a long,
 * negative for a short — so the closing side can be derived from it. */
export interface PositionToClose {
  player_id: number;
  shares: number;
  price: number;
}

/** The concrete trade that flattens a position to zero: a long is sold,
 * a short is bought back to cover. The returned ``shares`` is always
 * positive — the direction is carried by ``kind``. */
export function closing_trade(position: PositionToClose): { kind: "buy" | "sell"; shares: number } {
  return {
    kind: position.shares < 0 ? "buy" : "sell",
    shares: Math.abs(position.shares),
  };
}

/** Per-batch outcome — every position is attempted; one failure never
 * aborts the others. ``closed`` / ``failed`` partition the input. */
export interface CloseOutcome {
  closed: number[];
  failed: { player_id: number; error: string }[];
}

/** Executes the closing trade for one position. Rejects on backend error. */
export type TradeExecutor = (position: PositionToClose) => Promise<void>;

/** Close each position via ``execute``, sequentially.
 *
 * Sequential on purpose: every execution mutates the same portfolio
 * balance server-side, so concurrent writes would race on cash and
 * holdings. The position count is small (a user's open book) — latency
 * is a non-issue.
 *
 * One failure does not abort the batch: every position is attempted and
 * reported individually, so the caller can show a partial result. */
export async function close_positions(
  positions: readonly PositionToClose[],
  execute: TradeExecutor,
): Promise<CloseOutcome> {
  const closed: number[] = [];
  const failed: CloseOutcome["failed"] = [];
  for (const position of positions) {
    try {
      await execute(position);
      closed.push(position.player_id);
    } catch (err) {
      failed.push({
        player_id: position.player_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { closed, failed };
}
