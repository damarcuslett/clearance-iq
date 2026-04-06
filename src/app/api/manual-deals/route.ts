import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

interface ManualDealBody {
  retailerId: string;
  storeId?: string;
  productName: string;
  upc?: string;
  price: number;
  originalPrice: number;
  photoUrl?: string;
}

/**
 * POST /api/manual-deals — submit a deal manually (e.g. Menards in-store find)
 *
 * Enforces 70% minimum discount before accepting.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = (await request.json()) as ManualDealBody;

    const { retailerId, storeId, productName, upc, price, originalPrice, photoUrl } = body;

    if (!retailerId || !productName || price == null || originalPrice == null) {
      return Response.json(
        { error: "Missing required fields: retailerId, productName, price, originalPrice" },
        { status: 400 },
      );
    }

    if (price < 0 || originalPrice <= 0) {
      return Response.json(
        { error: "Invalid price values" },
        { status: 400 },
      );
    }

    // Calculate discount and enforce 70% floor
    const discountPct = Math.round(((originalPrice - price) / originalPrice) * 100);

    if (discountPct < 70) {
      return Response.json(
        {
          error: `Deal is only ${discountPct}% off. Minimum 70% discount required.`,
          discountPct,
        },
        { status: 422 },
      );
    }

    const deal = await prisma.manualDeal.create({
      data: {
        retailerId,
        storeId: storeId ?? null,
        productName,
        upc: upc ?? null,
        price,
        originalPrice,
        discountPct,
        photoUrl: photoUrl ?? null,
      },
    });

    return Response.json(deal, { status: 201 });
  } catch (error) {
    console.error("[API] POST /api/manual-deals error:", error);
    return Response.json(
      { error: "Failed to submit deal" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/manual-deals — list unverified manual submissions
 */
export async function GET(): Promise<Response> {
  try {
    const deals = await prisma.manualDeal.findMany({
      where: { verified: false },
      orderBy: { submittedAt: "desc" },
      take: 50,
    });

    return Response.json(deals);
  } catch (error) {
    console.error("[API] GET /api/manual-deals error:", error);
    return Response.json(
      { error: "Failed to fetch manual deals" },
      { status: 500 },
    );
  }
}
