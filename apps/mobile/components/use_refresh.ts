// Pull-to-refresh helper — wraps an async refetch in the boolean state a
// RefreshControl needs. Used by every scrollable tab.

import { useCallback, useState } from "react";

export function useRefresh(fn: () => Promise<unknown> | void): { refreshing: boolean; onRefresh: () => void } {
  const [refreshing, set_refreshing] = useState(false);
  const onRefresh = useCallback(() => {
    set_refreshing(true);
    Promise.resolve(fn()).finally(() => set_refreshing(false));
  }, [fn]);
  return { refreshing, onRefresh };
}
