"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/page-header";
import { fetchJSON } from "@/lib/api";
import type { DealsResponse } from "@/lib/types";

const DealMap = dynamic(() => import("@/components/deal-map"), { ssr: false });

export default function MapPage() {
  const deals = useQuery({
    queryKey: ["deals", "map"],
    queryFn: () => fetchJSON<DealsResponse>("/api/deals?limit=100"),
  });

  return (
    <div>
      <PageHeader
        title="Map View"
        subtitle="Ohio store locations · click a marker to see deals"
      />
      <div className="h-[calc(100vh-5rem)]">
        {deals.isLoading && <div className="p-6 text-[var(--muted)]">Loading map…</div>}
        {deals.data && <DealMap deals={deals.data.deals} />}
      </div>
    </div>
  );
}
