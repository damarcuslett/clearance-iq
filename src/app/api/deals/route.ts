import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { cached } from "@/lib/redis";

/**
 * GET /api/deals — paginated deals list
 *
 * Query params:
 *   retailer    — filter by retailer key (e.g. "walmart")
 *   dealType    — PENNY | CLEARANCE | HIDDEN | OPEN_BOX | LIGHTNING
 *   minDiscount — minimum discount % (default 70, NEVER below 70)
 *   maxDiscount — maximum discount % (default 99)
 *   city        — filter by store city
 *   inStock     — "true" to only show in-stock deals
 *   limit       — page size (default 50, max 100)
 *   offset      — pagination offset (default 0)
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const params = request.nextUrl.searchParams;

    const retailerKey = params.get("retailer");
    const dealType = params.get("dealType");
    const minDiscount = Math.max(70, parseInt(params.get("minDiscount") ?? "70", 10));
    const maxDiscount = Math.min(99, parseInt(params.get("maxDiscount") ?? "99", 10));
    const city = params.get("city");
    const inStockOnly = params.get("inStock") === "true";
    const limit = Math.min(100, Math.max(1, parseInt(params.get("limit") ?? "50", 10)));
    const offset = Math.max(0, parseInt(params.get("offset") ?? "0", 10));

    // Build a cache key from the query
    const cacheKey = `deals:${retailerKey}:${dealType}:${minDiscount}:${maxDiscount}:${city}:${inStockOnly}:${limit}:${offset}`;

    const data = await cached(cacheKey, 900, async () => {
      // Build where clause — ALWAYS enforce discountPct >= 70
      const where: Record<string, unknown> = {
        isActive: true,
        discountPct: {
          gte: minDiscount,
          lte: maxDiscount,
        },
      };

      if (retailerKey) {
        where.retailer = { key: retailerKey };
      }
      if (dealType) {
        where.dealType = dealType;
      }
      if (inStockOnly) {
        where.inStock = true;
      }
      if (city) {
        where.store = { city: { contains: city, mode: "insensitive" } };
      }

      const [deals, total] = await Promise.all([
        prisma.deal.findMany({
          where,
          include: {
            product: true,
            store: { select: { name: true, city: true, zip: true, lat: true, lng: true } },
            retailer: { select: { key: true, name: true, color: true } },
          },
          orderBy: [{ discountPct: "desc" }, { foundAt: "desc" }],
          take: limit,
          skip: offset,
        }),
        prisma.deal.count({ where }),
      ]);

      return {
        deals,
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      };
    });

    return Response.json(data);
  } catch (error) {
    console.error("[API] GET /api/deals error:", error);
    return Response.json(
      { error: "Failed to fetch deals" },
      { status: 500 },
    );
  }
}
