import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { cached } from "@/lib/redis";

/**
 * GET /api/products/lookup?upc=XXXX
 * Returns product + all active deals across stores.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const upc = request.nextUrl.searchParams.get("upc")?.trim();
    if (!upc) {
      return Response.json({ error: "upc query param required" }, { status: 400 });
    }

    const result = await cached(`lookup:${upc}`, 24 * 60 * 60, async () => {
      const product = await prisma.product.findUnique({ where: { upc } });
      if (!product) return { product: null, deals: [] };

      const deals = await prisma.deal.findMany({
        where: { productId: product.id, isActive: true, discountPct: { gte: 70 } },
        include: {
          store: { select: { name: true, city: true, zip: true, lat: true, lng: true } },
          retailer: { select: { key: true, name: true, color: true } },
        },
        orderBy: [{ currentPrice: "asc" }],
      });
      return { product, deals };
    });

    return Response.json(result);
  } catch (error) {
    console.error("[API] GET /api/products/lookup error:", error);
    return Response.json({ error: "Lookup failed" }, { status: 500 });
  }
}
