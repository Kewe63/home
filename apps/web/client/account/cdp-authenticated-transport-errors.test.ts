import "./dom-test-harness";

import { afterEach, describe, expect, test } from "bun:test";
import type { OwnerGenerationFence } from "./owner-generation-fence";
import type { SessionFetch, VerifiedAccountSession } from "./session-client";
import { TransferExecutionError } from "@/shared/transfers/types";

const { cleanup, render } = await import("@testing-library/react");
const { createElement, useEffect } = await import("react");
const { RetryableAccountReadError, useAuthenticatedTransport } = await import("./cdp-authenticated-transport");
const { DeploymentExpiredError } = await import("@/client/query/deployment-headers");

const previousDeploymentId = process.env.NEXT_DEPLOYMENT_ID;
const session: VerifiedAccountSession = {
  user: { subject: "subject" },
  smartAccount: {
    address: "0x1111111111111111111111111111111111111111",
    chainId: 8453,
  },
  accountProvider: "base-account",
};
const ownerFence: OwnerGenerationFence = {
  advance: () => 0,
  capture: () => 0,
  isCurrent: (identity) => identity === 0,
  assertCurrent: () => {},
  updateAuthorizationBoundary: () => {},
  updateOwnerKey: () => false,
};

afterEach(() => {
  cleanup();
  if (previousDeploymentId === undefined) delete process.env.NEXT_DEPLOYMENT_ID;
  else process.env.NEXT_DEPLOYMENT_ID = previousDeploymentId;
});

async function transportWith(sessionFetch: SessionFetch, overrides: Partial<Parameters<typeof useAuthenticatedTransport>[0]> = {}) {
  return await new Promise<ReturnType<typeof useAuthenticatedTransport>>((resolve) => {
    function Probe() {
      const transport = useAuthenticatedTransport({
        session,
        status: "verified",
        verification: "server",
        ownerKey: "owner",
        ownerFence,
        getAccessToken: async () => null,
        sessionFetch,
        authentication: "native-base",
        ...overrides,
      });
      useEffect(() => resolve(transport), [transport]);
      return null;
    }

    render(createElement(Probe));
  });
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  return await promise.then(
    () => { throw new Error("Expected promise to reject."); },
    (error: unknown) => error,
  );
}

describe("authenticated transport deployment expiry", () => {
  test("preserves a Home 404 error envelope when a deployment header is sent", async () => {
    process.env.NEXT_DEPLOYMENT_ID = "dpl_current";
    const transport = await transportWith(async (_input, init) => {
      expect(new Headers(init?.headers).get("x-deployment-id")).toBe("dpl_current");
      return Response.json(
        { error: { code: "ACTION_NOT_FOUND", message: "Action not found." } },
        { status: 404 },
      );
    });

    const error = await rejectionOf(
      transport.fetchAccountResource("/api/actions/missing/confirm", {
        method: "POST",
        body: {},
      }),
    );

    expect(error).toBeInstanceOf(TransferExecutionError);
    expect(error).toMatchObject({
      status: 404,
      code: "ACTION_NOT_FOUND",
      serverMessage: "Action not found.",
    });
  });

  test("classifies an envelope-less pinned 404 as an expired deployment", async () => {
    process.env.NEXT_DEPLOYMENT_ID = "dpl_expired";
    const transport = await transportWith(async (_input, init) => {
      expect(new Headers(init?.headers).get("x-deployment-id")).toBe("dpl_expired");
      return new Response("Not Found", { status: 404 });
    });

    const error = await rejectionOf(
      transport.fetchAccountResource("/api/actions/missing/confirm", {
        method: "POST",
        body: {},
      }),
    );

    expect(error).toBeInstanceOf(DeploymentExpiredError);
  });

  test("preserves an envelope-less 404 when no deployment header is sent", async () => {
    delete process.env.NEXT_DEPLOYMENT_ID;
    const transport = await transportWith(async (_input, init) => {
      expect(new Headers(init?.headers).get("x-deployment-id")).toBeNull();
      return new Response("Not Found", { status: 404 });
    });

    const error = await rejectionOf(
      transport.fetchAccountResource("/api/actions/missing/confirm", {
        method: "POST",
        body: {},
      }),
    );

    expect(error).toBeInstanceOf(TransferExecutionError);
    expect(error).toMatchObject({ status: 404, code: null, serverMessage: null });
  });
});


describe("retryable authenticated reads", () => {
  for (const status of [408, 429, 500, 502, 503, 504, 400, 401, 403, 404, 409, 422]) {
    test(`GET ${status} preserves metadata and classifies only transient statuses`, async () => {
      const transport = await transportWith(async () => Response.json(
        { error: { code: "READ_FAILED", message: "Read failed." } }, { status },
      ));
      const error = await rejectionOf(transport.fetchBalances("US"));
      expect(error instanceof RetryableAccountReadError).toBe([408, 429, 500, 502, 503, 504].includes(status));
      expect(error).toMatchObject({ status, code: "READ_FAILED", serverMessage: "Read failed." });
    });
  }

  test("a network GET failure is explicitly retryable, but an action POST is not", async () => {
    const transport = await transportWith(async () => { throw new TypeError("Failed to fetch"); });
    expect(await rejectionOf(transport.fetchBalances("US"))).toBeInstanceOf(RetryableAccountReadError);
    const error = await rejectionOf(transport.fetchAccountResource("/api/actions", { method: "POST" }));
    expect(error).toBeInstanceOf(TransferExecutionError);
    expect(error).not.toBeInstanceOf(RetryableAccountReadError);
  });

  for (const overrides of [{ session: null }, { authentication: "cdp" as const }]) {
    test(`missing ${overrides.session === null ? "session" : "CDP token"} is not retryable`, async () => {
      let calls = 0;
      const transport = await transportWith(async () => { calls++; throw new TypeError("network"); }, overrides);
      expect(await rejectionOf(transport.fetchBalances("US"))).not.toBeInstanceOf(RetryableAccountReadError);
      expect(calls).toBe(0);
    });
  }

  test("invalid JSON is not retryable", async () => {
    const transport = await transportWith(async () => new Response("not JSON"));
    expect(await rejectionOf(transport.fetchBalances("US"))).not.toBeInstanceOf(RetryableAccountReadError);
  });

  test("read deployment expiry still takes precedence", async () => {
    process.env.NEXT_DEPLOYMENT_ID = "dpl_expired";
    const transport = await transportWith(async () => new Response("Not Found", { status: 404 }));
    expect(await rejectionOf(transport.fetchBalances("US"))).toBeInstanceOf(DeploymentExpiredError);
  });

  test("cancellation preserves the original error, not a retryable marker", async () => {
    const controller = new AbortController();
    const aborted = new DOMException("Aborted", "AbortError");
    const transport = await transportWith(async () => { controller.abort(); throw aborted; });
    expect(await rejectionOf(transport.fetchBalances("US", controller.signal))).toBe(aborted);
  });

  test("an owner generation change during a failed read is not retryable", async () => {
    let current = true;
    const transport = await transportWith(async () => { current = false; throw new TypeError("network"); }, {
      ownerFence: { ...ownerFence, assertCurrent: () => {
        if (!current) throw new TransferExecutionError("stale-session");
      } },
    });
    const error = await rejectionOf(transport.fetchBalances("US"));
    expect(error).toBeInstanceOf(TransferExecutionError);
    expect(error).not.toBeInstanceOf(RetryableAccountReadError);
  });
});
