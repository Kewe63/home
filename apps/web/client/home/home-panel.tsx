"use client";

import { PiggyBank } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyTicker } from "@/components/money-ticker";
import type { FetchActivity } from "@/client/activity";
import { FundingActions } from "@/client/funding/funding-actions";
import { TransferActions } from "@/client/transfers";
import { previewHomeBalanceItems } from "@/client/portfolio";
import type { AssetMarkResolution } from "@/client/asset-mark/presentation";
import type { VerifiedAccountSession } from "@/shared/account/session-types";
import type { RegionId } from "@/config/regions";
import { ConnectedActivityPanel } from "./activity-panel";
import { HomeBalancesList } from "./balances-panel";
import type { HomeAssetBalancesPresentation } from "./home-types";
import { ShimmerRows } from "./panel-shared";
import { deriveSendAvailability } from "./send-availability";

function SectionHeader({
  headingId,
  title,
  onOpen,
}: {
  headingId: string;
  title: "Balances" | "Activity";
  onOpen: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="text-lg font-semibold" id={headingId}>{title}</h2>
      <Button size="sm" variant="ghost" onClick={onOpen} aria-label={title}>
        See all
      </Button>
    </div>
  );
}

export function HomePanel({
  assetBalances,
  assetMarkResolution,
  activitySession,
  fetchActivity,
  fetchOperations,
  onOpenSave,
  onOpenBalances,
  onOpenActivity,
  initialAddMoney = false,
  returnedFromProvider = false,
  initialSendFlow = false,
  initialSendActionId = null,
  regionId,
}: {
  assetBalances?: HomeAssetBalancesPresentation;
  assetMarkResolution?: AssetMarkResolution;
  activitySession: VerifiedAccountSession | null;
  fetchActivity: FetchActivity;
  fetchOperations: (signal?: AbortSignal) => Promise<unknown>;
  onOpenSave: () => void;
  onOpenBalances: () => void;
  onOpenActivity: () => void;
  initialAddMoney?: boolean;
  returnedFromProvider?: boolean;
  initialSendFlow?: boolean;
  initialSendActionId?: string | null;
  regionId: RegionId;
}) {
  const isLoading = assetBalances?.status === "loading";
  const isRevalidating = assetBalances?.revalidating === true;
  const showSessionShimmer = !activitySession && (isLoading || isRevalidating);
  const heroLabel = isLoading
    ? "Updating…"
    : assetBalances?.status === "unavailable"
      ? "Balance unavailable"
      : "Total balance";
  const balanceItems = assetBalances?.items ?? [];
  const balanceStatusLabel =
    assetBalances?.totalStatus === "partial" ? undefined : assetBalances?.statusLabel;
  const showBalanceStatus =
    assetBalances?.status !== "loading" &&
    balanceStatusLabel !== "Updating…" &&
    Boolean(balanceStatusLabel);

  return (
    <div className="space-y-6">
      <Card
        aria-label={heroLabel}
        aria-busy={isLoading || isRevalidating || undefined}
      >
        <CardContent className="space-y-2">
          {isLoading ? (
            <Skeleton className="h-10 w-48" data-shimmer="hero" />
          ) : (
            <div className="text-4xl font-semibold tracking-tight tabular-nums">
              <MoneyTicker value={assetBalances?.displayTotal ?? "—"} />
            </div>
          )}
          {showBalanceStatus ? (
            <p className="text-sm text-muted-foreground" data-total-status={assetBalances?.totalStatus}>
              {balanceStatusLabel}
            </p>
          ) : null}
          {isLoading || isRevalidating ? <span className="sr-only">Updating…</span> : null}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2" aria-label="Money actions">
        <FundingActions
          initialOpen={initialAddMoney}
          returnedFromProvider={returnedFromProvider}
          regionId={regionId}
        />
        <TransferActions
          initialOpen={initialSendFlow}
          initialActionId={initialSendActionId}
          availableAssets={deriveSendAvailability(balanceItems)}
        />
      </div>

      <section className="space-y-3" aria-labelledby="balances-heading">
        <SectionHeader
          headingId="balances-heading"
          title="Balances"
          onOpen={onOpenBalances}
        />
        <HomeBalancesList
          items={previewHomeBalanceItems(balanceItems)}
          isLoading={isLoading}
          isUnavailable={assetBalances?.status === "unavailable"}
          assetMarkResolution={assetMarkResolution}
        />
      </section>

      {showSessionShimmer ? (
        <Button className="h-11 w-full justify-between" variant="outline" onClick={onOpenSave} aria-label="Save">
          <Skeleton className="size-5" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-12" />
        </Button>
      ) : (
        <Button className="h-11 w-full justify-between" variant="outline" onClick={onOpenSave} aria-label="Save">
          <span className="flex items-center gap-2">
            <PiggyBank className="size-4" aria-hidden="true" />
            Save
          </span>
          <span className="text-muted-foreground">Earn</span>
        </Button>
      )}

      {showSessionShimmer ? (
        <section className="space-y-3" aria-labelledby="activity-title" aria-busy="true">
          <SectionHeader headingId="activity-title" title="Activity" onOpen={onOpenActivity} />
          <ShimmerRows count={2} />
        </section>
      ) : (
        <ConnectedActivityPanel
          density="teaser"
          header={
            <SectionHeader headingId="activity-title" title="Activity" onOpen={onOpenActivity} />
          }
          activitySession={activitySession}
          fetchActivity={fetchActivity}
          fetchOperations={fetchOperations}
          regionId={regionId}
        />
      )}
    </div>
  );
}
