"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { fetchJSON } from "@/lib/api";
import type { WatchlistItem } from "@/lib/types";

export default function WatchlistPage() {
  const qc = useQueryClient();
  const [upc, setUpc] = useState("");
  const [productName, setProductName] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [minDiscount, setMinDiscount] = useState(70);

  const list = useQuery({
    queryKey: ["watchlist"],
    queryFn: () => fetchJSON<{ items: WatchlistItem[] }>("/api/watchlist"),
  });

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upc,
          productName,
          targetPrice: targetPrice ? parseFloat(targetPrice) : undefined,
          minDiscount,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      setUpc("");
      setProductName("");
      setTargetPrice("");
      qc.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/watchlist?id=${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  return (
    <div>
      <PageHeader title="Watchlist" subtitle="Get alerts when products drop 70%+" />

      <div className="p-6 space-y-6 max-w-4xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-3"
        >
          <div className="text-sm font-semibold">Add Product</div>
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="UPC">
              <input
                required
                value={upc}
                onChange={(e) => setUpc(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-3 py-2 text-sm font-mono"
              />
            </Field>
            <Field label="Product Name">
              <input
                required
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Target Price (optional)">
              <input
                type="number"
                step="0.01"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-3 py-2 text-sm font-mono"
              />
            </Field>
            <Field label={`Min Discount: ${minDiscount}%`}>
              <input
                type="range"
                min={70}
                max={99}
                value={minDiscount}
                onChange={(e) => setMinDiscount(parseInt(e.target.value, 10))}
                className="w-full accent-[var(--accent)]"
              />
            </Field>
          </div>
          <button
            type="submit"
            disabled={create.isPending}
            className="bg-[var(--accent)] text-black font-bold px-4 py-2 rounded text-sm disabled:opacity-50"
          >
            {create.isPending ? "Adding…" : "Add to Watchlist"}
          </button>
        </form>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--border)] text-sm font-semibold">
            Watching ({list.data?.items.length ?? 0})
          </div>
          {list.isLoading && <div className="p-5 text-[var(--muted)]">Loading…</div>}
          {list.data?.items.length === 0 && (
            <div className="p-5 text-[var(--muted)] text-sm">No items yet.</div>
          )}
          {list.data && list.data.items.length > 0 && (
            <ul className="divide-y divide-[var(--border)]">
              {list.data.items.map((item) => (
                <li key={item.id} className="p-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{item.productName}</div>
                    <div className="text-xs text-[var(--muted)] font-mono">
                      {item.upc} · min {item.minDiscount}% off
                      {item.targetPrice !== null && ` · target $${item.targetPrice.toFixed(2)}`}
                    </div>
                  </div>
                  <button
                    onClick={() => remove.mutate(item.id)}
                    className="text-xs text-[var(--error)] hover:underline"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1">
        {label}
      </div>
      {children}
    </label>
  );
}
