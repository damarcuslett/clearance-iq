"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { DealCard } from "@/components/deal-card";
import { DealModal } from "@/components/deal-modal";
import { PageHeader } from "@/components/page-header";
import { fetchJSON } from "@/lib/api";
import type { DealsResponse, StatsResponse, DealWithRelations } from "@/lib/types";

const RETAILERS = ["walmart", "homedepot", "target", "bestbuy", "lowes", "menards", "amazon"];
const DEAL_TYPES = ["PENNY", "CLEARANCE", "HIDDEN", "OPEN_BOX", "LIGHTNING"];

export default function CommandCenter() {
  const [retailer, setRetailer] = useState<string | null>(null);
  const [dealType, setDealType] = useState<string | null>(null);
  const [minDiscount, setMinDiscount] = useState(70);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [selected, setSelected] = useState<DealWithRelations | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState<string | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (retailer) p.set("retailer", retailer);
    if (dealType) p.set("dealType", dealType);
    p.set("minDiscount", String(minDiscount));
    if (inStockOnly) p.set("inStock", "true");
    p.set("limit", "60");
    return p.toString();
  }, [retailer, dealType, minDiscount, inStockOnly]);

  const stats = useQuery({
    queryKey: ["stats"],
    queryFn: () => fetchJSON<StatsResponse>("/api/stats"),
  });

  const deals = useQuery({
    queryKey: ["deals", qs],
    queryFn: () => fetchJSON<DealsResponse>(`/api/deals?${qs}`),
    enabled: !searchQuery,
  });

  const search = useQuery({
    queryKey: ["search", searchQuery],
    queryFn: () =>
      fetchJSON<{ deals: DealWithRelations[]; total: number }>(
        `/api/search?q=${encodeURIComponent(searchQuery ?? "")}`
      ),
    enabled: !!searchQuery,
  });

  const activeDeals = searchQuery ? search.data?.deals ?? [] : deals.data?.deals ?? [];
  const activeTotal = searchQuery ? search.data?.total ?? 0 : deals.data?.total ?? 0;
  const isLoading = searchQuery ? search.isLoading : deals.isLoading;
  const isError = searchQuery ? search.isError : deals.isError;

  return (
    <div>
      <PageHeader
        title="Command Center"
        subtitle="Live clearance feed · 70%+ off only"
        right={
          <div className="flex items-center gap-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSearchQuery(searchInput.trim() || null);
              }}
              className="flex items-center gap-2"
            >
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Ask AI: power tools under $50 near Columbus"
                className="bg-[var(--bg)] border border-[var(--border)] rounded px-3 py-1.5 text-xs w-80"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery(null);
                    setSearchInput("");
                  }}
                  className="text-[var(--muted)] text-xs hover:text-[var(--text)]"
                >
                  clear
                </button>
              )}
              {searchQuery && (
                <span className="text-[10px] font-bold px-2 py-1 rounded bg-[var(--penny)]/20 text-[var(--penny)]">
                  AI SEARCH
                </span>
              )}
            </form>
            <div className="text-xs text-[var(--muted)] font-mono">
              {activeTotal} results
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-6 border-b border-[var(--border)]">
        <StatCard label="Deals Today" value={stats.data?.dealsFoundToday ?? 0} />
        <StatCard label="Penny Deals" value={stats.data?.pennyDeals ?? 0} accent="penny" />
        <StatCard label="Active Total" value={stats.data?.totalActiveDeals ?? 0} />
        <StatCard label="Avg Discount" value={`${stats.data?.avgDiscount ?? 0}%`} />
        <StatCard label="Stores Live" value={stats.data?.storesLive ?? 0} />
      </div>

      <div className="flex">
        <div className="hidden lg:block w-64 shrink-0 border-r border-[var(--border)] p-5 space-y-5 min-h-[calc(100vh-13rem)]">
          <FilterGroup label="Retailer">
            <select
              value={retailer ?? ""}
              onChange={(e) => setRetailer(e.target.value || null)}
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1.5 text-sm"
            >
              <option value="">All retailers</option>
              {RETAILERS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </FilterGroup>

          <FilterGroup label="Deal Type">
            <select
              value={dealType ?? ""}
              onChange={(e) => setDealType(e.target.value || null)}
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1.5 text-sm"
            >
              <option value="">All types</option>
              {DEAL_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </FilterGroup>

          <FilterGroup label={`Min Discount: ${minDiscount}%`}>
            <input
              type="range"
              min={70}
              max={99}
              value={minDiscount}
              onChange={(e) => setMinDiscount(parseInt(e.target.value, 10))}
              className="w-full accent-[var(--accent)]"
            />
          </FilterGroup>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => setInStockOnly(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            In-stock only
          </label>
        </div>

        <div className="flex-1 p-6">
          {isLoading && <div className="text-[var(--muted)]">Loading deals…</div>}
          {isError && <div className="text-[var(--error)]">Failed to load deals.</div>}
          {!isLoading && activeDeals.length === 0 && (
            <div className="text-[var(--muted)]">No deals match your filters.</div>
          )}
          {activeDeals.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {activeDeals.map((d) => (
                <DealCard key={d.id} deal={d} onClick={() => setSelected(d)} />
              ))}
            </div>
          )}
        </div>
      </div>

      <DealModal deal={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: "penny";
}) {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{label}</div>
      <div
        className={`text-2xl font-bold font-mono mt-1 ${
          accent === "penny" ? "text-[var(--penny)]" : "text-[var(--accent)]"
        }`}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-2">{label}</div>
      {children}
    </div>
  );
}
