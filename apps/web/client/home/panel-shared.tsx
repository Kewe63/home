import { Fragment, type ReactNode } from "react";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemContent, ItemGroup, ItemMedia, ItemSeparator } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { CurrencyMark } from "@/components/currency-mark";

export function MountedShellPanel({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return (
    <div
      data-shell-panel=""
      hidden={!active}
      inert={active ? undefined : true}
      aria-hidden={active ? undefined : true}
    >
      {children}
    </div>
  );
}

export function ShimmerRows({ count }: { count: number }) {
  return (
    <ItemGroup className="gap-0" aria-busy="true">
      {Array.from({ length: count }, (_, index) => (
        <Fragment key={index}>
          {index > 0 ? <ItemSeparator /> : null}
          <Item size="sm" className="flex-nowrap rounded-none border-0" data-shimmer="row">
            <ItemMedia><CurrencyMark pending /></ItemMedia>
            <ItemContent className="gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-20" />
            </ItemContent>
            <Skeleton className="h-4 w-16" />
          </Item>
        </Fragment>
      ))}
    </ItemGroup>
  );
}

export function EmptyPanel({ label }: { label: string }) {
  return (
    <section aria-label={label}>
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{label} unavailable</EmptyTitle>
        </EmptyHeader>
      </Empty>
    </section>
  );
}
