import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { parseSearchQuery } from "@/lib/groq";

/**
 * GET /api/search?q=natural+language+query
 * Uses Groq to parse the query into structured filters, then queries the DB.
 * Always enforces discountPct >= 70.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const q = request.nextUrl.searchParams.get("q")?.trim();
    if (!q) return Response.json({ error: "q required" }, { status: 400 });

    const filters = await parseSearchQuery(q);

    const where: Record<string, unknown> = {
      isActive: true,
      discountPct: { gte: Math.max(70, filters.minDiscount) },
    };

    if (filters.maxPrice !== null) {
      where.currentPrice = { lte: filters.maxPrice };
    }

    if (filters.retailers && filters.retailers.length > 0) {
      where.retailer = { key: { in: filters.retailers } };
    }

    if (filters.city) {
      where.store = { city: { contains: filters.city, mode: "insensitive" } };
    }

    if (filters.keywords.length > 0 || filters.category) {
      const terms = [...filters.keywords, filters.category].filter(Boolean) as string[];
      where.product = {
        OR: terms.flatMap((t) => [
          { name: { contains: t, mode: "insensitive" } },
          { category: { contains: t, mode: "insensitive" } },
          { brand: { contains: t, mode: "insensitive" } },
        ]),
      };
    }

    const deals = await prisma.deal.findMany({
      where,
      include: {
        product: true,
        store: { select: { name: true, city: true, zip: true, lat: true, lng: true } },
        retailer: { select: { key: true, name: true, color: true } },
      },
      orderBy: [{ aiScore: "desc" }, { discountPct: "desc" }],
      take: 60,
    });

    return Response.json({ filters, deals, total: deals.length });
  } catch (error) {
    console.error("[API] GET /api/search error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Search failed" },
      { status: 500 }
    );
  }
}
