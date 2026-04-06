import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/deals/[id] — single deal with price history
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;

    const deal = await prisma.deal.findUnique({
      where: { id },
      include: {
        product: true,
        store: true,
        retailer: { select: { key: true, name: true, color: true } },
        priceHistory: {
          orderBy: { recordedAt: "desc" },
          take: 50,
        },
      },
    });

    if (!deal) {
      return Response.json({ error: "Deal not found" }, { status: 404 });
    }

    return Response.json(deal);
  } catch (error) {
    console.error("[API] GET /api/deals/[id] error:", error);
    return Response.json(
      { error: "Failed to fetch deal" },
      { status: 500 },
    );
  }
}
