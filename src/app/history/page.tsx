"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import { PageHeader } from "@/components/page-header";
import { fetchJSON } from "@/lib/api";
import { formatPrice } from "@/lib/format";

type Range = "7d" | "30d" | "90d";

interface HistoryResponse {
  range: Range;
  days: number;
  totals: { totalDeals: number; totalSavings: number; avgDiscount: number };
  dailyData: { date: string; deals: number; avgDisc: number; savings: number; pennyDeals: number }[];
  weeklyData: { week: string; deals: number; avgDisc: number; savings: number }[];
  monthlyData: {
    month: string;
    deals: number;
    avgDisc: number;
    savings: number;
    bestDeal: { name: string; discountPct: number } | null;
  }[];
  categoryBreakdown: {
    category: string;
    deals: number;
    avgDiscount: number;
    totalSavings: number;
  }[];
  storeLeaderboard: { store: string; deals: number; pennyDeals: number; savings: number }[];
  missedDeals: {
    id: string;
    productName: string;
    imageUrl: string | null;
    upc: string;
    currentPrice: number;
    originalPrice: number;
    discountPct: number;
    savings: number;
    storeName: string;
    storeCity: string;
    retailerName: string;
    retailerColor: string;
    foundAt: string;
    expiresAt: string | null;
  }[];
}

const PIE_COLORS = ["#F97316", "#A855F7", "#22C55E", "#60A5FA", "#EAB308", "#EF4444", "#64748B"];

export default function HistoryPage() {
  const [range, setRange] = useState<Range>("30d");

  const history = useQuery({
    queryKey: ["history", range],
    queryFn: () => fetchJSON<HistoryResponse>(`/api/history?range=${range}`),
  });

  const heatmap = useQuery({
    queryKey: ["history-heatmap"],
    queryFn: () => fetchJSON<Record<string, number>>("/api/history/heatmap"),
  });

  const data = history.data;

  return (
    <div>
      <PageHeader
        title="History & Analytics"
        subtitle={data ? `${data.totals.totalDeals.toLocaleString()} deals in last ${data.days} days` : "Loading…"}
        right={
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as Range)}
            className="bg-[var(--bg)] border border-[var(--border)] rounded px-3 py-1.5 text-sm"
          >
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
            <option value="90d">90 days</option>
          </select>
        }
      />

      <div className="p-6 space-y-6">
        {history.isLoading && <div className="text-[var(--muted)]">Loading analytics…</div>}

        {data && data.totals.totalDeals === 0 && (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-8 text-center text-[var(--muted)]">
            Not enough data yet. Workers will start populating this view shortly.
          </div>
        )}

        {data && data.totals.totalDeals > 0 && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Metric label="Total Deals" value={data.totals.totalDeals.toLocaleString()} />
              <Metric label="Total Savings" value={formatPrice(data.totals.totalSavings)} />
              <Metric label="Avg Discount" value={`${data.totals.avgDiscount}%`} />
            </div>

            <ChartCard title="Deals Found — Daily">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={data.dailyData}>
                  <defs>
                    <linearGradient id="dealGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#F97316" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#F97316" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1E1E30" />
                  <XAxis dataKey="date" stroke="#64748B" fontSize={10} />
                  <YAxis stroke="#64748B" fontSize={10} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="deals" stroke="#F97316" fill="url(#dealGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <div className="grid md:grid-cols-2 gap-6">
              <ChartCard title="Avg Discount — Daily">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={data.dailyData}>
                    <CartesianGrid stroke="#1E1E30" />
                    <XAxis dataKey="date" stroke="#64748B" fontSize={10} />
                    <YAxis stroke="#64748B" fontSize={10} domain={[70, 100]} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line type="monotone" dataKey="avgDisc" stroke="#A855F7" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Savings — Weekly (12w)">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.weeklyData}>
                    <CartesianGrid stroke="#1E1E30" />
                    <XAxis dataKey="week" stroke="#64748B" fontSize={10} />
                    <YAxis stroke="#64748B" fontSize={10} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="savings" fill="#22C55E" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Top Categories">
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={data.categoryBreakdown.slice(0, 7)}
                      dataKey="deals"
                      nameKey="category"
                      outerRadius={90}
                      label
                    >
                      {data.categoryBreakdown.slice(0, 7).map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Monthly Totals">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data.monthlyData}>
                    <CartesianGrid stroke="#1E1E30" />
                    <XAxis dataKey="month" stroke="#64748B" fontSize={10} />
                    <YAxis stroke="#64748B" fontSize={10} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="deals" fill="#F97316" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <ChartCard title="Activity Heatmap — Last 13 Weeks">
              <Heatmap counts={heatmap.data ?? {}} />
            </ChartCard>

            <ChartCard title="Store Leaderboard">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[10px] uppercase text-[var(--muted)]">
                    <tr>
                      <th className="text-left py-2">#</th>
                      <th className="text-left py-2">Store</th>
                      <th className="text-right py-2">Deals</th>
                      <th className="text-right py-2">Penny</th>
                      <th className="text-right py-2">Savings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {data.storeLeaderboard.map((s, i) => (
                      <tr key={s.store}>
                        <td className="py-2 font-mono text-[var(--muted)]">{i + 1}</td>
                        <td className="py-2">{s.store}</td>
                        <td className="py-2 text-right font-mono text-[var(--accent)]">{s.deals}</td>
                        <td className="py-2 text-right font-mono text-[var(--penny)]">{s.pennyDeals}</td>
                        <td className="py-2 text-right font-mono">{formatPrice(s.savings)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ChartCard>

            <ChartCard title="Missed Deals (expired)">
              {data.missedDeals.length === 0 ? (
                <div className="text-[var(--muted)] text-sm">No expired deals in this range.</div>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {data.missedDeals.map((d) => (
                    <li key={d.id} className="py-3 flex items-center gap-3">
                      <span
                        className="text-[10px] font-bold uppercase px-2 py-1 rounded"
                        style={{
                          backgroundColor: `${d.retailerColor}22`,
                          color: d.retailerColor,
                        }}
                      >
                        {d.retailerName}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{d.productName}</div>
                        <div className="text-xs text-[var(--muted)]">
                          {d.storeName}, {d.storeCity}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-[var(--accent)]">
                          {formatPrice(d.currentPrice)}
                        </div>
                        <div className="text-[10px] text-[var(--muted)] font-mono">
                          saved {formatPrice(d.savings)} · {d.discountPct}%
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </ChartCard>
          </>
        )}
      </div>
    </div>
  );
}

const tooltipStyle = {
  backgroundColor: "#13131F",
  border: "1px solid #1E1E30",
  borderRadius: 8,
  fontSize: 12,
};

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{label}</div>
      <div className="text-3xl font-bold font-mono mt-1 text-[var(--accent)]">{value}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
      <div className="text-sm font-semibold mb-4">{title}</div>
      {children}
    </div>
  );
}

function Heatmap({ counts }: { counts: Record<string, number> }) {
  const weeks = useMemo(() => {
    const days: { iso: string; count: number }[] = [];
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    // Align to Sunday as start of week
    const endDay = today.getUTCDay();
    const end = new Date(today);
    end.setUTCDate(today.getUTCDate() + (6 - endDay));
    for (let i = 12 * 7 + 6; i >= 0; i--) {
      const d = new Date(end);
      d.setUTCDate(end.getUTCDate() - i);
      const iso = d.toISOString().slice(0, 10);
      days.push({ iso, count: counts[iso] ?? 0 });
    }
    const ws: { iso: string; count: number }[][] = [];
    for (let i = 0; i < days.length; i += 7) ws.push(days.slice(i, i + 7));
    return ws;
  }, [counts]);

  const max = Math.max(1, ...Object.values(counts));
  const color = (n: number): string => {
    if (n === 0) return "#13131F";
    const pct = n / max;
    if (pct > 0.75) return "#F97316";
    if (pct > 0.5) return "rgba(249,115,22,0.75)";
    if (pct > 0.25) return "rgba(249,115,22,0.5)";
    return "rgba(249,115,22,0.25)";
  };

  return (
    <div className="flex gap-[3px]">
      {weeks.map((week, i) => (
        <div key={i} className="flex flex-col gap-[3px]">
          {week.map((day) => (
            <div
              key={day.iso}
              title={`${day.iso}: ${day.count} deals`}
              className="w-3 h-3 rounded-[2px] border border-[var(--border)]"
              style={{ backgroundColor: color(day.count) }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
