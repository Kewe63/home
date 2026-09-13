"use client";

import { Separator } from "@/components/ui/separator";
import { MoneyModal, MoneyModalHeader } from "@/client/money-modal";
import type { TransactionDetails } from "./transaction-explorer";

export type {
  TransactionDetailRow,
  TransactionDetails,
  TransactionExplorerLink,
} from "./transaction-explorer";

export function TransactionDetailsModal({
  open,
  titleId,
  details,
  onClose,
}: {
  open: boolean;
  titleId: string;
  details: TransactionDetails | null;
  onClose: () => void;
}) {
  const rows = details?.rows ?? [];
  return (
    <MoneyModal
      open={open}
      labelledBy={titleId}
      onCancel={onClose}
      onClose={onClose}
    >
      <MoneyModalHeader
        title={details?.title ?? ""}
        titleId={titleId}
        onClose={onClose}
        closeLabel="Close transaction details"
      />
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <dl className="divide-y divide-border border-y">
          {rows.map((row) => (
            <div className="flex items-start justify-between gap-4 py-3 text-sm" key={row.label}>
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="min-w-0 text-right font-medium tabular-nums" title={row.title}>{row.value}</dd>
            </div>
          ))}
        </dl>
        {details?.explorer ? (
          <>
            <Separator className="my-4" />
            <div className="flex justify-end">
              <a
                className="text-sm font-medium text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={details.explorer.href}
                target="_blank"
                rel="noopener noreferrer"
                title={details.explorer.title}
              >
                {details.explorer.label}
                <span aria-hidden="true"> ↗</span>
              </a>
            </div>
          </>
        ) : null}
      </div>
    </MoneyModal>
  );
}
