import { prisma } from "@/lib/db";

/**
 * GET /api/sync-status — latest sync log per retailer
 *
 * Powers the Automation dashboard screen. Always fresh (no cache).
 */
export async function GET(): Promise<Response> {
  try {
    const data = await (async () => {
      const retailers = await prisma.retailer.findMany({
        where: { isActive: true },
        select: {
          id: true,
          key: true,
          name: true,
          color: true,
          lastSyncedAt: true,
          syncLogs: {
            orderBy: { startedAt: "desc" },
            take: 1,
            select: {
              id: true,
              startedAt: true,
              completedAt: true,
              itemsScanned: true,
              dealsFound: true,
              dealsBelow70: true,
              status: true,
              errorMessage: true,
            },
          },
        },
        orderBy: { name: "asc" },
      });

      return retailers.map((r) => ({
        retailerId: r.id,
        retailerKey: r.key,
        retailerName: r.name,
        retailerColor: r.color,
        lastSyncedAt: r.lastSyncedAt,
        latestSync: r.syncLogs[0] ?? null,
      }));
    })();

    return Response.json(data);
  } catch (error) {
    console.error("[API] GET /api/sync-status error:", error);
    return Response.json(
      { error: "Failed to fetch sync status" },
      { status: 500 },
    );
  }
}
