"use client";

import type { DealWithRelations } from "@/lib/types";
import { formatPrice, formatDiscount, timeAgo } from "@/lib/format";
import { useEffect } from "react";

interface Props {
  deal: DealWithRelations | null;
  onClose: () => void;
}

export function DealModal({ deal, onClose }: Props) {
  useEffect(() => {
    if (!deal) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deal, onClose]);

  if (!deal) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--card)] border border-[var(--border)] rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <span
              className="text-xs font-bold uppercase px-3 py-1 rounded"
              style={{ backgroundColor: `${deal.retailer.color}22`, color: deal.retailer.color }}
            >
              {deal.retailer.name}
            </span>
            <button
              onClick={onClose}
              className="text-[var(--muted)] hover:text-[var(--text)] text-2xl leading-none"
            >
              ×
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="h-64 bg-[var(--bg)] rounded-xl flex items-center justify-center border border-[var(--border)]">
              {deal.product.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={deal.product.imageUrl}
                  alt={deal.product.name}
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="text-[var(--muted)]">No image</span>
              )}
            </div>

            <div>
              <h2 className="text-xl font-bold mb-2">{deal.product.name}</h2>
              {deal.product.brand && (
                <div className="text-sm text-[var(--muted)] mb-3">{deal.product.brand}</div>
              )}

              <div className="font-mono mb-4">
                <div className="text-4xl font-bold text-[var(--accent)]">
                  {formatPrice(deal.currentPrice)}
                </div>
                <div className="text-sm text-[var(--muted)] line-through">
                  {formatPrice(deal.originalPrice)}
                </div>
                <div className="text-xs text-[var(--success)] mt-1">
                  {formatDiscount(deal.discountPct)} · Save{" "}
                  {formatPrice(deal.originalPrice - deal.currentPrice)}
                </div>
              </div>

              <dl className="text-xs space-y-1 text-[var(--muted)]">
                <div className="flex justify-between">
                  <dt>UPC</dt>
                  <dd className="font-mono text-[var(--text)]">{deal.product.upc}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Store</dt>
                  <dd className="text-[var(--text)]">
                    {deal.store.name}, {deal.store.city}
                  </dd>
                </div>
                {deal.aisle && (
                  <div className="flex justify-between">
                    <dt>Location</dt>
                    <dd className="text-[var(--blue)] font-mono">
                      Aisle {deal.aisle}
                      {deal.bay && ` · Bay ${deal.bay}`}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt>Found</dt>
                  <dd className="text-[var(--text)]">{timeAgo(deal.foundAt)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Stock</dt>
                  <dd className={deal.inStock ? "text-[var(--success)]" : "text-[var(--error)]"}>
                    {deal.inStock ? "In Stock" : "Out of Stock"}
                  </dd>
                </div>
              </dl>

              {deal.sourceUrl && (
                <a
                  href={deal.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 block text-center bg-[var(--accent)] text-black font-bold py-2 rounded-lg hover:opacity-90"
                >
                  View at Retailer →
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
