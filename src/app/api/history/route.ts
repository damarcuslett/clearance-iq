import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { cached } from "@/lib/redis";

/**
 * GET /api/history?range=7d|30d|90d
 *
 * Returns rich analytics aggregates for the History screen.
 * Cache: 1 hour (data changes slowly).
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const raw = request.nextUrl.searchParams.get("range") ?? "30d";
    const range = (["7d", "30d", "90d"] as const).includes(raw as never)
      ? (raw as "7d" | "30d" | "90d")
      : "30d";
    const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;

    const data = await cached(`history:v2:${range}`, 3600, async () => {
      const now = new Date();
      const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      const twelveWeeksAgo = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000);
      const twelveMonthsAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

      // Range-scoped deals (drives daily + category + store leaderboard)
      const rangeDeals = await prisma.deal.findMany({
        where: { foundAt: { gte: since } },
        select: {
          foundAt: true,
          currentPrice: true,
          originalPrice: true,
          discountPct: true,
          product: { select: { category: true } },
          store: { select: { name: true } },
        },
      });

      // Daily aggregation
      const dailyMap = new Map<
        string,
        { iso: string; deals: number; discSum: number; savings: number; pennyDeals: number }
      >();
      for (const d of rangeDeals) {
        const iso = d.foundAt.toISOString().slice(0, 10);
        const cur = dailyMap.get(iso) ?? {
          iso,
          deals: 0,
          discSum: 0,
          savings: 0,
          pennyDeals: 0,
        };
        cur.deals += 1;
        cur.discSum += d.discountPct;
        cur.savings += d.originalPrice - d.currentPrice;
        if (d.currentPrice <= 0.01) cur.pennyDeals += 1;
        dailyMap.set(iso, cur);
      }
      const dailyData = Array.from(dailyMap.values())
        .map((d) => ({
          date: new Date(`${d.iso}T00:00:00Z`).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          deals: d.deals,
          avgDisc: Math.round(d.discSum / d.deals),
          savings: Math.round(d.savings),
          pennyDeals: d.pennyDeals,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // 12 weeks weekly aggregation
      const weeklyDeals = await prisma.deal.findMany({
        where: { foundAt: { gte: twelveWeeksAgo } },
        select: {
          foundAt: true,
          currentPrice: true,
          originalPrice: true,
          discountPct: true,
        },
      });
      const weeklyMap = new Map<
        string,
        { week: string; deals: number; discSum: number; savings: number }
      >();
      for (const d of weeklyDeals) {
        const dt = new Date(d.foundAt);
        const day = dt.getUTCDay();
        const monday = new Date(dt);
        monday.setUTCDate(dt.getUTCDate() - ((day + 6) % 7));
        const key = monday.toISOString().slice(0, 10);
        const cur = weeklyMap.get(key) ?? {
          week: key,
          deals: 0,
          discSum: 0,
          savings: 0,
        };
        cur.deals += 1;
        cur.discSum += d.discountPct;
        cur.savings += d.originalPrice - d.currentPrice;
        weeklyMap.set(key, cur);
      }
      const weeklyData = Array.from(weeklyMap.values())
        .map((w) => ({
          week: w.week,
          deals: w.deals,
          avgDisc: Math.round(w.discSum / w.deals),
          savings: Math.round(w.savings),
        }))
        .sort((a, b) => a.week.localeCompare(b.week));

      // Monthly aggregation (last 12 months)
      const monthlyDeals = await prisma.deal.findMany({
        where: { foundAt: { gte: twelveMonthsAgo } },
        select: {
          foundAt: true,
          currentPrice: true,
          originalPrice: true,
          discountPct: true,
          product: { select: { name: true } },
        },
      });
      interface MonthBucket {
        month: string;
        deals: number;
        discSum: number;
        savings: number;
        best: { name: string; discountPct: number } | null;
      }
      const monthlyMap = new Map<string, MonthBucket>();
      for (const d of monthlyDeals) {
        const dt = new Date(d.foundAt);
        const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
        const cur = monthlyMap.get(key) ?? {
          month: key,
          deals: 0,
          discSum: 0,
          savings: 0,
          best: null,
        };
        cur.deals += 1;
        cur.discSum += d.discountPct;
        cur.savings += d.originalPrice - d.currentPrice;
        if (!cur.best || d.discountPct > cur.best.discountPct) {
          cur.best = { name: d.product.name, discountPct: d.discountPct };
        }
        monthlyMap.set(key, cur);
      }
      const monthlyData = Array.from(monthlyMap.values())
        .map((m) => ({
          month: m.month,
          deals: m.deals,
          avgDisc: Math.round(m.discSum / m.deals),
          savings: Math.round(m.savings),
          bestDeal: m.best,
        }))
        .sort((a, b) => a.month.localeCompare(b.month));

      // Category breakdown (within range)
      const catMap = new Map<
        string,
        { category: string; deals: number; discSum: number; savings: number }
      >();
      for (const d of rangeDeals) {
        const cat = d.product.category ?? "Uncategorized";
        const cur = catMap.get(cat) ?? {
          category: cat,
          deals: 0,
          discSum: 0,
          savings: 0,
        };
        cur.deals += 1;
        cur.discSum += d.discountPct;
        cur.savings += d.originalPrice - d.currentPrice;
        catMap.set(cat, cur);
      }
      const categoryBreakdown = Array.from(catMap.values())
        .map((c) => ({
          category: c.category,
          deals: c.deals,
          avgDiscount: Math.round(c.discSum / c.deals),
          totalSavings: Math.round(c.savings),
        }))
        .sort((a, b) => b.deals - a.deals);

      // Store leaderboard (within range)
      const storeMap = new Map<
        string,
        { store: string; deals: number; pennyDeals: number; savings: number }
      >();
      for (const d of rangeDeals) {
        const name = d.store.name;
        const cur = storeMap.get(name) ?? {
          store: name,
          deals: 0,
          pennyDeals: 0,
          savings: 0,
        };
        cur.deals += 1;
        if (d.currentPrice <= 0.01) cur.pennyDeals += 1;
        cur.savings += d.originalPrice - d.currentPrice;
        storeMap.set(name, cur);
      }
      const storeLeaderboard = Array.from(storeMap.values())
        .map((s) => ({ ...s, savings: Math.round(s.savings) }))
        .sort((a, b) => b.deals - a.deals)
        .slice(0, 10);

      // Missed deals — expired, biggest absolute savings
      const missedRaw = await prisma.deal.findMany({
        where: { isActive: false, foundAt: { gte: since } },
        include: {
          product: { select: { name: true, imageUrl: true, upc: true } },
          store: { select: { name: true, city: true } },
          retailer: { select: { name: true, color: true } },
        },
        take: 200,
      });
      const missedDeals = missedRaw
        .map((d) => ({
          id: d.id,
          productName: d.product.name,
          imageUrl: d.product.imageUrl,
          upc: d.product.upc,
          currentPrice: d.currentPrice,
          originalPrice: d.originalPrice,
          discountPct: d.discountPct,
          savings: Math.round(d.originalPrice - d.currentPrice),
          storeName: d.store.name,
          storeCity: d.store.city,
          retailerName: d.retailer.name,
          retailerColor: d.retailer.color,
          foundAt: d.foundAt.toISOString(),
          expiresAt: d.expiresAt?.toISOString() ?? null,
        }))
        .sort((a, b) => b.savings - a.savings)
        .slice(0, 20);

      const totalDeals = rangeDeals.length;
      const totalSavings = Math.round(
        rangeDeals.reduce((s, d) => s + (d.originalPrice - d.currentPrice), 0)
      );
      const avgDiscount = totalDeals
        ? Math.round(rangeDeals.reduce((s, d) => s + d.discountPct, 0) / totalDeals)
        : 0;

      return {
        range,
        days,
        totals: { totalDeals, totalSavings, avgDiscount },
        dailyData,
        weeklyData,
        monthlyData,
        categoryBreakdown,
        storeLeaderboard,
        missedDeals,
      };
    });

    return Response.json(data);
  } catch (error) {
    console.error("[API] GET /api/history error:", error);
    return Response.json({ error: "Failed to fetch history" }, { status: 500 });
  }
}
