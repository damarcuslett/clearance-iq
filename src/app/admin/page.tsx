"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { fetchJSON } from "@/lib/api";
import type { SyncStatusItem } from "@/lib/types";
import { timeAgo } from "@/lib/format";

export default function AdminPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["sync-status"],
    queryFn: () => fetchJSON<SyncStatusItem[]>("/api/sync-status"),
    refetchInterval: 60_000,
  });

  return (
    <div>
      <PageHeader
        title="Automation"
        subtitle="Worker health · auto-refresh every 60s"
      />

      <div className="p-6">
        {isLoading && <div className="text-[var(--muted)]">Loading…</div>}

        {data && (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg)] text-[10px] uppercase text-[var(--muted)]">
                <tr>
                  <th className="text-left px-4 py-3">Retailer</th>
                  <th className="text-left px-4 py-3">Last Sync</th>
                  <th className="text-right px-4 py-3">Scanned</th>
                  <th className="text-right px-4 py-3">Deals Found</th>
                  <th className="text-right px-4 py-3">70%+</th>
                  <th className="text-left px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {data.map((item) => {
                  const l = item.latestSync;
                  return (
                    <tr key={item.retailerId}>
                      <td className="px-4 py-3">
                        <span
                          className="text-[10px] font-bold uppercase px-2 py-1 rounded"
                          style={{
                            backgroundColor: `${item.retailerColor}22`,
                            color: item.retailerColor,
                          }}
                        >
                          {item.retailerName}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--muted)] font-mono text-xs">
                        {item.lastSyncedAt ? timeAgo(item.lastSyncedAt) : "never"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {l?.itemsScanned ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {l?.dealsFound ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[var(--accent)]">
                        {l?.dealsBelow70 ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {l ? (
                          <span
                            className={
                              l.status === "success"
                                ? "text-[var(--success)]"
                                : l.status === "error"
                                ? "text-[var(--error)]"
                                : "text-[var(--warning)]"
                            }
                          >
                            {l.status}
                          </span>
                        ) : (
                          <span className="text-[var(--muted)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
