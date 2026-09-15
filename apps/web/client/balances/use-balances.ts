"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { RetryableAccountReadError } from "@/client/account/cdp-authenticated-transport";
import { dataOwnerKey } from "@/client/account/owner-keys";
import { browserHomeQueryClient, ownerQueryKey, ownerQueryMeta, useHomeQuery, useHomeQueryClient } from "@/client/query/query-client";
import type { RegionId } from "@/config/regions";
import { parseBalancesSnapshot } from "@/shared/balances/contract";
import type {
  BalancesSession,
  BalancesSnapshot,
  BalancesState,
  FetchBalances,
} from "@/shared/balances/types";

type BalancesQuerySession = BalancesSession & { accountProvider?: string };

export const balancesStaleTimeMs = 15_000;

export function useBalances(
  session: BalancesQuerySession | null,
  region: RegionId,
  fetchBalances: FetchBalances,
  options: { enabled?: boolean } = {},
): BalancesState & { revalidating?: true } {
  const validSession = isBalancesSession(session) ? session : null;
  const ownerKey = validSession ? dataOwnerKey(validSession) : null;
  const queryClient = useHomeQueryClient(browserHomeQueryClient());
  const query = useHomeQuery<BalancesSnapshot>({
    queryKey: ownerKey
      ? ownerQueryKey(ownerKey, "balances", region)
      : ["unauthenticated", "balances-disabled", region],
    enabled: ownerKey !== null && options.enabled !== false,
    staleTime: balancesStaleTimeMs,
    retry: false,
    refetchOnWindowFocus: true,
    meta: ownerKey ? ownerQueryMeta(ownerKey, "owner") : undefined,
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[0] === ownerKey && previousQuery.queryKey[2] === region
        ? keepPreviousData(previousData) : undefined,
    queryFn: async ({ signal, queryKey }) => {
      if (!validSession) throw new Error("Balances are unavailable.");
      let payload: unknown;
      try {
        payload = await fetchBalances(region, signal);
      } catch (error) {
        // Inspect before TanStack records this failure. A hard error or action
        // invalidation must not resurrect an earlier successful observation.
        const cached = queryClient.getQueryState<BalancesSnapshot>(queryKey);
        if (!(error instanceof RetryableAccountReadError) || signal.aborted ||
          cached?.status !== "success" || cached.isInvalidated) throw error;
        return { ...parseBalancesSnapshot(cached.data, validSession, region), stale: true };
      }
      // Parsing failures are not transient transport failures.
      return parseBalancesSnapshot(payload, validSession, region);
    },
  });

  if (!ownerKey) return { status: "unavailable", snapshot: null, error: null };
  if (query.isPending) return { status: "loading", snapshot: null, error: null };
  if (query.isError) return { status: "error", snapshot: null, error: "balances-unavailable" };
  return {
    status: "ready",
    snapshot: query.data,
    error: null,
    ...(query.isFetching ? { revalidating: true as const } : {}),
  };
}

function isBalancesSession(value: BalancesQuerySession | null): value is BalancesQuerySession {
  return Boolean(
    value &&
    value.subject &&
    /^0x[0-9a-fA-F]{40}$/.test(value.smartAccountAddress) &&
    value.chainId === 8453,
  );
}
