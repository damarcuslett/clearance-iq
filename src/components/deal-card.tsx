"use client";

import type { DealWithRelations } from "@/lib/types";
import { formatPrice, formatDiscount, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  deal: DealWithRelations;
  onClick?: () => void;
}

export function DealCard({ deal, onClick }: Props) {
  const isPenny = deal.discountPct >= 99;
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-left bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--accent)]/60 transition-all group",
        isPenny && "border-[var(--penny)]/60 shadow-[0_0_20px_rgba(168,85,247,0.15)]"
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <span
          className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded"
          style={{ backgroundColor: `${deal.retailer.color}22`, color: deal.retailer.color }}
        >
          {deal.retailer.name}
        </span>
        <span
          className={cn(
            "text-[10px] font-bold px-2 py-1 rounded",
            isPenny
              ? "bg-[var(--penny)]/20 text-[var(--penny)]"
              : "bg-[var(--accent)]/20 text-[var(--accent)]"
          )}
        >
          {isPenny ? "PENNY" : formatDiscount(deal.discountPct)}
        </span>
      </div>

      <div className="h-32 bg-[var(--bg)] rounded-lg mb-3 flex items-center justify-center overflow-hidden border border-[var(--border)]">
        {deal.product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={deal.product.imageUrl}
            alt={deal.product.name}
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="text-[var(--muted)] text-xs">No image</span>
        )}
      </div>

      <div className="text-sm font-medium line-clamp-2 mb-2 min-h-[2.5rem]">
        {deal.product.name}
      </div>

      <div className="flex items-baseline gap-2 mb-2 font-mono">
        <span className="text-2xl font-bold text-[var(--accent)]">
          {formatPrice(deal.currentPrice)}
        </span>
        <span className="text-xs text-[var(--muted)] line-through">
          {formatPrice(deal.originalPrice)}
        </span>
      </div>

      <div className="flex items-center justify-between text-[10px] text-[var(--muted)]">
        <span>{deal.store.name}</span>
        <span>{timeAgo(deal.foundAt)}</span>
      </div>

      {deal.aiScore !== null && (
        <div
          className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded"
          style={{
            backgroundColor:
              deal.aiScore >= 9
                ? "rgba(168,85,247,0.15)"
                : deal.aiScore >= 7
                ? "rgba(249,115,22,0.15)"
                : "rgba(100,116,139,0.15)",
            color:
              deal.aiScore >= 9
                ? "var(--penny)"
                : deal.aiScore >= 7
                ? "var(--accent)"
                : "var(--muted)",
          }}
          title={deal.aiScoreReason ?? undefined}
        >
          AI {deal.aiScore}/10
        </div>
      )}

      {(deal.aisle || deal.bay) && (
        <div className="mt-2 text-[10px] text-[var(--blue)] font-mono">
          {deal.aisle && `Aisle ${deal.aisle}`}
          {deal.bay && ` · Bay ${deal.bay}`}
        </div>
      )}
    </button>
  );
}
