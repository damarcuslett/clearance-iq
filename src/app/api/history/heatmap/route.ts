import { prisma } from "@/lib/db";
import { cached } from "@/lib/redis";

/**
 * GET /api/history/heatmap
 * Returns last 91 days of deal counts keyed by ISO date ("YYYY-MM-DD").
 * Cache: 4 hours.
 */
export async function GET(): Promise<Response> {
  try {
    const data = await cached("history:heatmap:91d", 4 * 60 * 60, async () => {
      const since = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
      const deals = await prisma.deal.findMany({
        where: { foundAt: { gte: since } },
        select: { foundAt: true },
      });
      const counts: Record<string, number> = {};
      for (const d of deals) {
        const key = d.foundAt.toISOString().slice(0, 10);
        counts[key] = (counts[key] ?? 0) + 1;
      }
      return counts;
    });

    return Response.json(data);
  } catch (error) {
    console.error("[API] GET /api/history/heatmap error:", error);
    return Response.json({ error: "Failed to fetch heatmap" }, { status: 500 });
  }
}
