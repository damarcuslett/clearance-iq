import { prisma } from "@/lib/db";
import { cached } from "@/lib/redis";

/**
 * GET /api/stats — dashboard summary stats
 *
 * Returns: dealsFoundToday, avgDiscount, pennyDeals,
 *          storesLive, lastSyncAt, alertsSent
 *
 * Cached 5 minutes in Upstash Redis.
 */
export async function GET(): Promise<Response> {
  try {
    const stats = await cached("stats:dashboard", 300, async () => {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      const [
        dealsFoundToday,
        pennyDeals,
        activeDeals,
        storesLive,
        alertsSent,
        lastSync,
      ] = await Promise.all([
        // Deals found today
        prisma.deal.count({
          where: {
            foundAt: { gte: todayStart },
            isActive: true,
            discountPct: { gte: 70 },
          },
        }),

        // Penny deals (active)
        prisma.deal.count({
          where: {
            dealType: "PENNY",
            isActive: true,
          },
        }),

        // All active deals for avg discount calc
        prisma.deal.aggregate({
          where: {
            isActive: true,
            discountPct: { gte: 70 },
          },
          _avg: { discountPct: true },
          _count: true,
        }),

        // Active stores
        prisma.store.count({
          where: { isActive: true },
        }),

        // Alerts sent today
        prisma.alertLog.count({
          where: {
            sentAt: { gte: todayStart },
            success: true,
          },
        }),

        // Most recent sync
        prisma.syncLog.findFirst({
          orderBy: { startedAt: "desc" },
          select: { completedAt: true, retailerId: true },
        }),
      ]);

      return {
        dealsFoundToday,
        pennyDeals,
        totalActiveDeals: activeDeals._count,
        avgDiscount: Math.round(activeDeals._avg.discountPct ?? 0),
        storesLive,
        alertsSent,
        lastSyncAt: lastSync?.completedAt ?? null,
      };
    });

    return Response.json(stats);
  } catch (error) {
    console.error("[API] GET /api/stats error:", error);
    return Response.json(
      { error: "Failed to fetch stats" },
      { status: 500 },
    );
  }
}
