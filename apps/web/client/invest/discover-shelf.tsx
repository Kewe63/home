import { Fragment } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ItemSeparator } from "@/components/ui/item";
import type { InvestAsset } from "@/config/invest-assets";
import type { AssetMarkResolution } from "@/client/asset-mark/presentation";
import type { MarketDataState } from "@/shared/invest/invest-market";
import type { MemeShelfStatus } from "./discover";
import { DiscoverAssetRow } from "./discover-asset-row";

export function DiscoverShelf({
  title,
  assets,
  market,
  status = "ready",
  assetMarkResolution = {},
  onSeeAll,
  onOpenAsset,
}: {
  title: string;
  assets: readonly InvestAsset[];
  market: MarketDataState;
  status?: MemeShelfStatus;
  assetMarkResolution?: AssetMarkResolution;
  onSeeAll: () => void;
  onOpenAsset: (asset: InvestAsset) => void;
}) {
  const titleId = `${title.toLowerCase()}-shelf-title`;

  return (
    <section aria-labelledby={titleId}>
      <Card>
        <CardHeader>
          <CardTitle id={titleId} role="heading" aria-level={3}>{title}</CardTitle>
          <CardAction>
            <Button variant="ghost" size="sm" onClick={onSeeAll}>
              See all ›
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="px-2">
          {assets.length > 0 ? (
            <ul className="m-0 list-none p-0">
              {assets.map((asset, index) => (
                <Fragment key={asset.id}>
                  {index > 0 ? (
                    <li aria-hidden="true">
                      <ItemSeparator className="my-0" />
                    </li>
                  ) : null}
                  <DiscoverAssetRow
                    asset={asset}
                    market={market}
                    assetMarkResolution={assetMarkResolution}
                    onOpen={() => onOpenAsset(asset)}
                  />
                </Fragment>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              {shelfStatusLabel(status)}
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function shelfStatusLabel(status: MemeShelfStatus) {
  if (status === "loading") return "Loading";
  if (status === "error" || status === "unavailable") return "Unavailable";
  return "None trending";
}
