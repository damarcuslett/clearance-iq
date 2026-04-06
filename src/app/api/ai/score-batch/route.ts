import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { scoreDeal } from "@/lib/groq";

const CRON_SECRET = process.env.CRON_SECRET ?? "";
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 2100; // ~28 req/min ceiling

function authorized(req: NextRequest): boolean {
  if (!CRON_SECRET) return true;
  return req.headers.get("authorization") === `Bearer ${CRON_SECRET}`;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function POST(req: NextRequest): Promise<Response> {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });

  try {
    const limit = Math.min(
      100,
      parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10)
    );

    const unscored = await prisma.deal.findMany({
      where: { aiScore: null, isActive: true, discountPct: { gte: 70 } },
      include: { product: true },
      orderBy: [{ discountPct: "desc" }, { foundAt: "desc" }],
      take: limit,
    });

    let scored = 0;
    let failed = 0;

    for (let i = 0; i < unscored.length; i += BATCH_SIZE) {
      const batch = unscored.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (deal) => {
          try {
            const result = await scoreDeal({
              currentPrice: deal.currentPrice,
              originalPrice: deal.originalPrice,
              discountPct: deal.discountPct,
              dealType: deal.dealType,
              inStock: deal.inStock,
              quantity: deal.quantity,
              product: {
                name: deal.product.name,
                brand: deal.product.brand,
                category: deal.product.category,
                msrp: deal.product.msrp,
              },
            });
            await prisma.deal.update({
              where: { id: deal.id },
              data: { aiScore: result.score, aiScoreReason: result.reason },
            });
            scored++;
          } catch (err) {
            console.warn(`[ai] score failed for deal ${deal.id}:`, err);
            failed++;
          }
        })
      );
      if (i + BATCH_SIZE < unscored.length) await sleep(BATCH_DELAY_MS);
    }

    return Response.json({ total: unscored.length, scored, failed });
  } catch (error) {
    console.error("[API] score-batch error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
