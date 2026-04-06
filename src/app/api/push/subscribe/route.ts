import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

interface Body {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = (await request.json()) as Body;
    if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      return Response.json({ error: "Invalid subscription" }, { status: 400 });
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      update: { p256dh: body.keys.p256dh, auth: body.keys.auth, isActive: true },
      create: {
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
      },
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[API] POST /api/push/subscribe error:", error);
    return Response.json({ error: "Failed to subscribe" }, { status: 500 });
  }
}
