import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { sendDailyDigestEmail } from "@/lib/email";
import { generateDailyInsight } from "@/lib/groq";
import type { DealForEmail } from "../../../../../emails/_shared";

const EMAIL_TO = process.env.EMAIL_TO ?? "";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

function authorized(req: NextRequest): boolean {
  if (!CRON_SECRET) return true;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${CRON_SECRET}`;
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!EMAIL_TO) return Response.json({ error: "EMAIL_TO not configured" }, { status: 500 });

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const deals = await prisma.deal.findMany({
      where: { foundAt: { gte: since }, discountPct: { gte: 70 } },
      include: { product: true, store: true, retailer: true },
      orderBy: { discountPct: "desc" },
      take: 200,
    });

    const total = deals.length;
    const avg = total ? Math.round(deals.reduce((a, d) => a + d.discountPct, 0) / total) : 0;

    const toEmail = (d: (typeof deals)[number]): DealForEmail => ({
      productName: d.product.name,
      brand: d.product.brand,
      imageUrl: d.product.imageUrl,
      upc: d.product.upc,
      sku: d.product.sku,
      currentPrice: d.currentPrice,
      originalPrice: d.originalPrice,
      discountPct: d.discountPct,
      storeName: d.store.name,
      storeCity: d.store.city,
      storeAddress: d.store.address,
      aisle: d.aisle,
      bay: d.bay,
      quantity: d.quantity,
      foundAt: d.foundAt.toISOString(),
    });

    const pennyDeals = deals.filter((d) => d.currentPrice <= 0.01).slice(0, 5).map(toEmail);
    const topDeals = deals.slice(0, 5).map(toEmail);

    let insight: string | null = null;
    try {
      insight = await generateDailyInsight(
        deals.slice(0, 20).map((d) => ({
          name: d.product.name,
          discountPct: d.discountPct,
          currentPrice: d.currentPrice,
          storeName: d.store.name,
          category: d.product.category,
        }))
      );
    } catch (err) {
      console.warn("[cron] insight generation failed:", err);
    }

    await sendDailyDigestEmail(EMAIL_TO, {
      dateLabel: new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      totalDeals: total,
      avgDiscount: avg,
      topDeals,
      pennyDeals,
      expiredNear: [],
      insight,
    });

    return Response.json({ ok: true, total, avg });
  } catch (error) {
    console.error("[cron] daily-digest error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
