import "@/client/account/dom-test-harness";

import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import {
  getHomeQueryClient,
  ownerQueryKey,
  queryObservationTime,
  shouldPersistOwnerQuery,
} from "@/client/query/query-client";
import { balancesSnapshotFixture } from "@/shared/balances/fixtures";
import type { FetchBalances } from "@/shared/balances/types";
import { useBalances } from "./use-balances";
import { useAuthenticatedTransport } from "@/client/account/cdp-authenticated-transport";
import type { SessionFetch } from "@/client/account/session-client";
import type { RegionId } from "@/config/regions";
import { dataOwnerKey } from "@/client/account/owner-keys";
import { invalidateAfterAction } from "@/client/query/after-action";
import { presentBalances } from "@/shared/balances/present";
import { BalancesPage } from "@/client/home/balances-panel";

const session = {
  subject: "subject-a",
  smartAccountAddress: balancesSnapshotFixture.owner.address,
  chainId: 8453 as const,
};

function Harness({ fetchBalances }: { fetchBalances: FetchBalances }) {
  const state = useBalances(session, "US", fetchBalances);
  return <output>{state.status === "ready" ? `${state.snapshot.region}:${state.snapshot.holdings.filter((holding) => holding.source === "catalog").length}` : state.status}</output>;
}

afterEach(() => {
  cleanup();
  getHomeQueryClient().clear();
});

describe("useBalances", () => {
  test("uses the owner balances key and persists the whole snapshot", async () => {
    render(<Harness fetchBalances={async () => balancesSnapshotFixture} />);
    await waitFor(() => expect(document.body.textContent).toBe("US:3"));

    const ownerKey = `${session.subject}\u0000${session.smartAccountAddress}\u00008453`;
    const query = getHomeQueryClient().getQueryCache().find({
      queryKey: ownerQueryKey(ownerKey, "balances", "US"),
    });
    expect(query?.meta).toEqual({ persistence: "owner", ownerKey });
    expect(query && shouldPersistOwnerQuery(query, ownerKey)).toBe(true);
    expect((query?.state.data as typeof balancesSnapshotFixture).holdings.filter((holding) => holding.source === "catalog")).toHaveLength(3);
  });

  test("fails closed when the response scope does not match the verified owner", async () => {
    const mismatched = {
      ...balancesSnapshotFixture,
      owner: { ...balancesSnapshotFixture.owner, address: "0x2222222222222222222222222222222222222222" as const },
    };
    render(<Harness fetchBalances={async () => mismatched} />);
    await waitFor(() => expect(document.body.textContent).toBe("error"));
  });
});


const key = ownerQueryKey(dataOwnerKey(session), "balances", "US");
const ownerFence = {
  advance: () => 0, capture: () => 0, isCurrent: () => true,
  assertCurrent: () => {}, updateAuthorizationBoundary: () => {}, updateOwnerKey: () => false,
};

function TransportHarness({ sessionFetch, region = "US", owner = session, authentication = "native-base" }: {
  sessionFetch: SessionFetch;
  region?: RegionId;
  owner?: typeof session;
  authentication?: "native-base" | "cdp";
}) {
  const transport = useAuthenticatedTransport({
    session: { user: { subject: owner.subject }, smartAccount: {
      address: owner.smartAccountAddress, chainId: 8453,
    }, accountProvider: "base-account" },
    status: "verified", verification: "server", ownerKey: dataOwnerKey(owner), ownerFence,
    getAccessToken: async () => "test-token", authentication, sessionFetch,
  });
  const state = useBalances(owner, region, transport.fetchBalances);
  const presentation = presentBalances(state, {
    showSmallBalances: false, nowMs: Date.parse(balancesSnapshotFixture.fetchedAt) + 120_000,
  });
  return <>
    <output data-testid="state">{state.status}</output>
    <output data-testid="total">{presentation.displayTotal}</output>
    <BalancesPage active assetBalances={presentation} showSmallBalances={false}
      revealSmallBalances={false} onRevealSmallBalancesChange={() => {}}
      isChecking={false} revealedCount={100} onRevealMore={() => {}} />
  </>;
}

const networkFailure: SessionFetch = async () => { throw new TypeError("Failed to fetch"); };
const freshResponse: SessionFetch = async () => Response.json(balancesSnapshotFixture);
async function refetch() {
  await act(async () => { await getHomeQueryClient().refetchQueries({ queryKey: key }); await new Promise((resolve) => setTimeout(resolve, 0)); });
}

for (const authentication of ["native-base", "cdp"] as const) {
  test(`${authentication}: retains the total, rows and observation age after a background network error`, async () => {
    let read = freshResponse;
    let calls = 0;
    const view = render(<TransportHarness authentication={authentication} sessionFetch={async (...args) => {
      calls++;
      return read(...args);
    }} />);
    await waitFor(() => expect(view.getByTestId("state").textContent).toBe("ready"));
    const total = view.getByTestId("total").textContent;
    const rows = view.getByLabelText("Your money").textContent;
    expect(total).toContain("3,852.88");
    await refetch(); // successful-refetch control
    expect(calls).toBe(2);
    const observation = () => getHomeQueryClient().getQueryCache().find({ queryKey: key })!;
    read = networkFailure;
    await refetch();
    await waitFor(() => expect(view.getByTestId("state").textContent).toBe("ready"));
    expect(queryObservationTime(observation())).toBe(Date.parse(balancesSnapshotFixture.fetchedAt));
    expect(shouldPersistOwnerQuery(observation(), dataOwnerKey(session), Date.parse(balancesSnapshotFixture.fetchedAt) + 86_400_001)).toBe(false);
    expect(calls).toBe(3); // no added retries
    expect(getHomeQueryClient().getQueryData<typeof balancesSnapshotFixture>(key)).toEqual({ ...balancesSnapshotFixture, stale: true });
    expect(view.getByTestId("total").textContent).toBe(total);
    expect(view.getByLabelText("Your money").textContent).toContain(rows!);
    expect(view.getByLabelText("Your money").textContent).toContain("Updated 2 min ago");
    await refetch(); // repeated benign failure retains both observation timestamps
    expect(queryObservationTime(observation())).toBe(Date.parse(balancesSnapshotFixture.fetchedAt));
    expect(shouldPersistOwnerQuery(observation(), dataOwnerKey(session), Date.parse(balancesSnapshotFixture.fetchedAt) + 86_400_001)).toBe(false);
    expect(getHomeQueryClient().getQueryData<typeof balancesSnapshotFixture>(key)).toEqual({ ...balancesSnapshotFixture, stale: true });
    read = freshResponse;
    await refetch();
    await waitFor(() => expect(view.getByLabelText("Your money").textContent).not.toContain("Updated"));
    expect(getHomeQueryClient().getQueryData<typeof balancesSnapshotFixture>(key)).toEqual(balancesSnapshotFixture);
  });
}

test("an initial network failure has no fallback", async () => {
  const view = render(<TransportHarness sessionFetch={networkFailure} />);
  await waitFor(() => expect(view.getByTestId("state").textContent).toBe("error"));
  expect(view.getByTestId("total").textContent).toBe("");
});

const hardFailures: [string, SessionFetch][] = [
  ...[401, 403, 400].map((status): [string, SessionFetch] => [String(status), async () => Response.json({ error: { code: "DENIED" } }, { status })]),
  ["invalid JSON", async () => new Response("not json")],
  ["invalid payload", async () => Response.json({})],
  ["wrong owner", async () => Response.json({ ...balancesSnapshotFixture, owner: { ...balancesSnapshotFixture.owner, address: "0x2222222222222222222222222222222222222222" } })],
  ["wrong region", async () => Response.json({ ...balancesSnapshotFixture, region: "DE" })],
];
for (const [label, failure] of hardFailures) {
  test(`${label}: hides cached balances and a later network error cannot resurrect them`, async () => {
    let read = freshResponse;
    const view = render(<TransportHarness sessionFetch={(...args) => read(...args)} />);
    await waitFor(() => expect(view.getByTestId("state").textContent).toBe("ready"));
    read = failure;
    await refetch();
    await waitFor(() => expect(view.getByTestId("state").textContent).toBe("error"));
    read = networkFailure;
    await refetch();
    expect(view.getByTestId("state").textContent).toBe("error");
    expect(view.getByTestId("total").textContent).toBe("");
  });
}

test("action invalidation disallows fallback until a successful fresh read", async () => {
  let read = freshResponse;
  const view = render(<TransportHarness sessionFetch={(...args) => read(...args)} />);
  await waitFor(() => expect(view.getByTestId("state").textContent).toBe("ready"));
  read = networkFailure;
  await act(async () => { await invalidateAfterAction(getHomeQueryClient(), dataOwnerKey(session)); });
  await waitFor(() => expect(view.getByTestId("state").textContent).toBe("error"));
  expect(getHomeQueryClient().getQueryState(key)?.isInvalidated).toBe(true);
  await refetch();
  expect(view.getByTestId("state").textContent).toBe("error");
  read = freshResponse;
  await refetch();
  await waitFor(() => expect(view.getByTestId("state").textContent).toBe("ready"));
  read = networkFailure;
  await refetch();
  expect(getHomeQueryClient().getQueryData<typeof balancesSnapshotFixture>(key)).toEqual({ ...balancesSnapshotFixture, stale: true });
});

for (const change of ["owner", "region"] as const) {
  test(`${change} change cannot reuse another scope's snapshot on failure`, async () => {
    const view = render(<TransportHarness sessionFetch={freshResponse} />);
    await waitFor(() => expect(view.getByTestId("state").textContent).toBe("ready"));
    view.rerender(<TransportHarness sessionFetch={networkFailure}
      owner={change === "owner" ? { ...session, subject: "subject-b" } : session}
      region={change === "region" ? "DE" : "US"} />);
    await waitFor(() => expect(view.getByTestId("state").textContent).toBe("error"));
    expect(view.getByTestId("total").textContent).toBe("");
  });
}
