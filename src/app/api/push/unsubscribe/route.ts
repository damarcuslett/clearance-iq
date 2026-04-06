import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

interface Body {
  endpoint: string;
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = (await request.json()) as Body;
    if (!body.endpoint) {
      return Response.json({ error: "endpoint required" }, { status: 400 });
    }
    await prisma.pushSubscription.updateMany({
      where: { endpoint: body.endpoint },
      data: { isActive: false },
    });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[API] POST /api/push/unsubscribe error:", error);
    return Response.json({ error: "Failed to unsubscribe" }, { status: 500 });
  }
}
