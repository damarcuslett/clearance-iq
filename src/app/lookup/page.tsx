"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { fetchJSON } from "@/lib/api";
import { formatPrice, formatDiscount } from "@/lib/format";

interface LookupResponse {
  product: {
    id: string;
    upc: string;
    name: string;
    brand: string | null;
    category: string | null;
    imageUrl: string | null;
    msrp: number | null;
  } | null;
  deals: {
    id: string;
    currentPrice: number;
    originalPrice: number;
    discountPct: number;
    inStock: boolean;
    store: { name: string; city: string };
    retailer: { key: string; name: string; color: string };
  }[];
}

export default function LookupPage() {
  const [input, setInput] = useState("");
  const [upc, setUpc] = useState<string | null>(null);

  const { data, isFetching } = useQuery({
    queryKey: ["lookup", upc],
    queryFn: () => fetchJSON<LookupResponse>(`/api/products/lookup?upc=${upc}`),
    enabled: !!upc,
  });

  return (
    <div>
      <PageHeader title="UPC Lookup" subtitle="Find a product across every Ohio store" />

      <div className="p-6 max-w-3xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setUpc(input.trim());
          }}
          className="flex gap-2 mb-6"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter UPC"
            className="flex-1 bg-[var(--card)] border border-[var(--border)] rounded px-4 py-3 font-mono"
          />
          <button
            type="submit"
            className="bg-[var(--accent)] text-black font-bold px-6 rounded"
          >
            Search
          </button>
        </form>

        {isFetching && <div className="text-[var(--muted)]">Searching…</div>}

        {data && !data.product && (
          <div className="text-[var(--muted)]">
            No product found for UPC <span className="font-mono">{upc}</span>.
          </div>
        )}

        {data?.product && (
          <div className="space-y-6">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 flex gap-4">
              <div className="h-28 w-28 shrink-0 bg-[var(--bg)] border border-[var(--border)] rounded flex items-center justify-center overflow-hidden">
                {data.product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={data.product.imageUrl}
                    alt={data.product.name}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="text-[var(--muted)] text-xs">No image</span>
                )}
              </div>
              <div className="min-w-0">
                <div className="text-lg font-bold">{data.product.name}</div>
                {data.product.brand && (
                  <div className="text-sm text-[var(--muted)]">{data.product.brand}</div>
                )}
                <div className="text-xs text-[var(--muted)] font-mono mt-2">
                  UPC {data.product.upc}
                </div>
                {data.product.msrp && (
                  <div className="text-xs text-[var(--muted)] font-mono">
                    MSRP {formatPrice(data.product.msrp)}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-[var(--border)] text-sm font-semibold">
                Active Deals ({data.deals.length})
              </div>
              {data.deals.length === 0 ? (
                <div className="p-5 text-[var(--muted)] text-sm">
                  No active 70%+ deals on this product right now.
                </div>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {data.deals.map((d) => (
                    <li key={d.id} className="p-4 flex items-center gap-3">
                      <span
                        className="text-[10px] font-bold uppercase px-2 py-1 rounded"
                        style={{
                          backgroundColor: `${d.retailer.color}22`,
                          color: d.retailer.color,
                        }}
                      >
                        {d.retailer.name}
                      </span>
                      <div className="flex-1 text-sm">
                        {d.store.name}, {d.store.city}
                      </div>
                      <div className="font-mono text-[var(--accent)] font-bold">
                        {formatPrice(d.currentPrice)}
                      </div>
                      <div className="text-xs text-[var(--muted)] w-16 text-right">
                        {formatDiscount(d.discountPct)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
