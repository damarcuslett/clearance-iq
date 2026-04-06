import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(): Promise<Response> {
  try {
    const items = await prisma.watchlist.findMany({ orderBy: { createdAt: "desc" } });
    return Response.json({ items });
  } catch (error) {
    console.error("[API] GET /api/watchlist error:", error);
    return Response.json({ error: "Failed to fetch watchlist" }, { status: 500 });
  }
}

interface CreateBody {
  upc: string;
  productName: string;
  targetPrice?: number;
  minDiscount?: number;
  notifyEmail?: boolean;
  notifyPush?: boolean;
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = (await request.json()) as CreateBody;
    if (!body.upc || !body.productName) {
      return Response.json({ error: "upc and productName required" }, { status: 400 });
    }

    const minDiscount = Math.max(70, body.minDiscount ?? 70);

    const item = await prisma.watchlist.create({
      data: {
        upc: body.upc,
        productName: body.productName,
        targetPrice: body.targetPrice ?? null,
        minDiscount,
        notifyEmail: body.notifyEmail ?? true,
        notifyPush: body.notifyPush ?? true,
      },
    });
    return Response.json({ item });
  } catch (error) {
    console.error("[API] POST /api/watchlist error:", error);
    return Response.json({ error: "Failed to create watchlist item" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<Response> {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    await prisma.watchlist.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[API] DELETE /api/watchlist error:", error);
    return Response.json({ error: "Failed to delete" }, { status: 500 });
  }
}
