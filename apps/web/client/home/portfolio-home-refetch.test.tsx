import "@/client/account/dom-test-harness";
import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { AccountWalletClientProvider, createBlockedAccountWalletClient } from "@/client/account/cdp-client";
import { RetryableAccountReadError } from "@/client/account/cdp-authenticated-transport";
import { getHomeQueryClient } from "@/client/query/query-client";
import { balancesSnapshotFixture } from "@/shared/balances/fixtures";

mock.module("next/navigation", () => ({
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));
const { PortfolioHomeExperience } = await import("./portfolio-home-experience");
afterEach(() => { cleanup(); getHomeQueryClient().clear(); localStorage.clear(); });

test("Home retains the verified total after a transient background refresh and recovers", async () => {
  let failing = false;
  let requests = 0;
  const client = {
    ...createBlockedAccountWalletClient("unconfigured"),
    projectConfigured: true, signInAvailability: "ready" as const,
    isSignedIn: true, ownerKey: "refetch-user", status: "verified" as const,
    verification: "server" as const,
    session: { user: { subject: "refetch-user" }, accountProvider: "cdp-embedded" as const,
      smartAccount: { address: balancesSnapshotFixture.owner.address, chainId: 8453 as const } },
    fetchBalances: async () => {
      requests++;
      if (failing) throw new RetryableAccountReadError();
      return balancesSnapshotFixture;
    },
  };
  const view = render(<AccountWalletClientProvider client={client}>
    <PortfolioHomeExperience routeMode="dashboard" detectedCountry="US"
      applyInboundUrlIntent={false} savingsContent={<span />} investContent={<span />} />
  </AccountWalletClientProvider>);
  const total = () => view.container.querySelector('[aria-label="Total balance"]')?.textContent ?? "";
  const refetch = async () => {
    await act(async () => { await getHomeQueryClient().refetchQueries({
      type: "active", predicate: (query) => query.queryKey.includes("balances"),
    }); });
  };
  await waitFor(() => expect(total()).toContain("3,852.88"));
  await refetch();
  expect(requests).toBe(2);
  failing = true;
  await refetch();
  await waitFor(() => {
    const query = getHomeQueryClient().getQueryCache().getAll().find(q => q.queryKey.includes("balances"));
    expect(query?.state.data).toEqual({ ...balancesSnapshotFixture, stale: true });
    expect(total()).toContain("3,852.88");
  });
  expect(requests).toBe(3);
  expect(view.container.querySelector('[aria-label="Balance unavailable"]')).toBeNull();
  failing = false;
  await refetch();
  await waitFor(() => {
    const query = getHomeQueryClient().getQueryCache().getAll().find(q => q.queryKey.includes("balances"));
    expect(query?.state.data).toEqual(balancesSnapshotFixture);
    expect(total()).toContain("3,852.88");
  });
});
