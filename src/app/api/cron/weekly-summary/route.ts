import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { sendWeeklySummaryEmail } from "@/lib/email";
import type { DealForEmail } from "../../../../../emails/_shared";

const EMAIL_TO = process.env.EMAIL_TO ?? "";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

function authorized(req: NextRequest): boolean {
  if (!CRON_SECRET) return true;
  return req.headers.get("authorization") === `Bearer ${CRON_SECRET}`;
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!EMAIL_TO) return Response.json({ error: "EMAIL_TO not configured" }, { status: 500 });

  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const deals = await prisma.deal.findMany({
      where: { foundAt: { gte: since }, discountPct: { gte: 70 } },
      include: { product: true, store: true, retailer: true },
      orderBy: { discountPct: "desc" },
    });

    const total = deals.length;
    const avg = total ? Math.round(deals.reduce((a, d) => a + d.discountPct, 0) / total) : 0;

    // Store leaderboard
    const storeCounts = new Map<string, number>();
    for (const d of deals) {
      storeCounts.set(d.store.name, (storeCounts.get(d.store.name) ?? 0) + 1);
    }
    const leaderboard = Array.from(storeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const categoryCounts = new Map<string, number>();
    for (const d of deals) {
      if (d.product.category) {
        categoryCounts.set(d.product.category, (categoryCounts.get(d.product.category) ?? 0) + 1);
      }
    }
    const trendingCategories = Array.from(categoryCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);

    const best = deals[0];
    const bestDeal: DealForEmail | null = best
      ? {
          productName: best.product.name,
          brand: best.product.brand,
          imageUrl: best.product.imageUrl,
          upc: best.product.upc,
          sku: best.product.sku,
          currentPrice: best.currentPrice,
          originalPrice: best.originalPrice,
          discountPct: best.discountPct,
          storeName: best.store.name,
          storeCity: best.store.city,
          storeAddress: best.store.address,
          aisle: best.aisle,
          bay: best.bay,
          quantity: best.quantity,
          foundAt: best.foundAt.toISOString(),
        }
      : null;

    const now = new Date();
    const weekStart = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) =>
      d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const weekLabel = `${fmt(weekStart)} – ${fmt(now)}, ${now.getFullYear()}`;

    await sendWeeklySummaryEmail(EMAIL_TO, {
      weekLabel,
      totalDeals: total,
      avgDiscount: avg,
      bestDeal,
      storeLeaderboard: leaderboard,
      trendingCategories,
    });

    return Response.json({ ok: true, total, avg });
  } catch (error) {
    console.error("[cron] weekly-summary error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
