import { prisma } from "@/lib/db";
import { sendPushNotification, type PushPayload } from "@/lib/push";
import {
  sendPennyAlertEmail,
  sendHighDiscountEmail,
  sendWatchlistHitEmail,
} from "@/lib/email";
import type { DealForEmail } from "../../emails/_shared";

const EMAIL_TO = process.env.EMAIL_TO ?? "";
const MIN_ALERT_DISCOUNT = parseInt(process.env.MIN_ALERT_DISCOUNT ?? "85", 10);
const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

interface DealInput {
  id: string;
  currentPrice: number;
  originalPrice: number;
  discountPct: number;
  foundAt: Date | string;
  quantity?: number | null;
  aisle?: string | null;
  bay?: string | null;
  sourceUrl?: string | null;
  product: {
    upc: string;
    name: string;
    brand?: string | null;
    imageUrl?: string | null;
    sku?: string | null;
  };
  store: {
    name: string;
    city: string;
    address?: string | null;
  };
  retailer: {
    name: string;
  };
}

function toEmailDeal(deal: DealInput): DealForEmail {
  return {
    productName: deal.product.name,
    brand: deal.product.brand ?? null,
    imageUrl: deal.product.imageUrl ?? null,
    upc: deal.product.upc ?? null,
    sku: deal.product.sku ?? null,
    currentPrice: deal.currentPrice,
    originalPrice: deal.originalPrice,
    discountPct: deal.discountPct,
    storeName: deal.store.name,
    storeCity: deal.store.city,
    storeAddress: deal.store.address ?? null,
    aisle: deal.aisle ?? null,
    bay: deal.bay ?? null,
    quantity: deal.quantity ?? null,
    foundAt:
      typeof deal.foundAt === "string" ? deal.foundAt : deal.foundAt.toISOString(),
  };
}

function buildPushPayload(deal: DealInput): PushPayload {
  const isPenny = deal.currentPrice <= 0.01;
  const title = isPenny
    ? `🔴 PENNY DEAL — $${deal.currentPrice.toFixed(2)}`
    : `🔥 ${deal.discountPct}% OFF — $${deal.currentPrice.toFixed(2)}`;
  const locationBits = [
    deal.aisle && `Aisle ${deal.aisle}`,
    deal.bay && `Bay ${deal.bay}`,
    deal.quantity != null && `${deal.quantity} in stock`,
  ].filter(Boolean);
  const suffix = locationBits.length ? ` · ${locationBits.join(" · ")}` : "";
  const body = `${deal.product.name} @ ${deal.store.name}${suffix}`;

  return {
    title,
    body,
    url: `/?deal=${deal.id}`,
    tag: isPenny ? "penny" : "high-discount",
  };
}

async function checkRecentAlert(dealId: string): Promise<boolean> {
  const since = new Date(Date.now() - COOLDOWN_MS);
  const recent = await prisma.alertLog.findFirst({
    where: { dealId, sentAt: { gte: since } },
  });
  return !!recent;
}

async function logAlert(
  dealId: string,
  channel: string,
  status: "sent" | "failed",
  watchlistId?: string,
  error?: string,
  message = ""
): Promise<void> {
  try {
    await prisma.alertLog.create({
      data: {
        dealId,
        watchlistId: watchlistId ?? null,
        channel,
        message,
        success: status === "sent",
        error: error ?? null,
      },
    });
  } catch (err) {
    console.error("[alerts] Failed to log alert:", err);
  }
}

export async function triggerDealAlerts(deal: DealInput): Promise<void> {
  const isPenny = deal.currentPrice <= 0.01;
  const isHighDiscount = deal.discountPct >= MIN_ALERT_DISCOUNT;

  if (!isPenny && !isHighDiscount) {
    // Still check watchlist
    await handleWatchlistMatches(deal);
    return;
  }

  if (await checkRecentAlert(deal.id)) return;

  const payload = buildPushPayload(deal);

  // Push to all active subscriptions
  const subs = await prisma.pushSubscription.findMany({ where: { isActive: true } });
  const pushResults = await Promise.allSettled(
    subs.map((s) => sendPushNotification(s, payload))
  );
  const pushOk = pushResults.some(
    (r) => r.status === "fulfilled" && r.value.ok
  );
  await logAlert(deal.id, "push", pushOk ? "sent" : "failed");

  // Expire dead subscriptions (410 Gone)
  for (let i = 0; i < pushResults.length; i++) {
    const r = pushResults[i];
    const sub = subs[i];
    if (
      r.status === "fulfilled" &&
      !r.value.ok &&
      r.value.error &&
      /410|404/.test(r.value.error)
    ) {
      await prisma.pushSubscription
        .update({ where: { endpoint: sub.endpoint }, data: { isActive: false } })
        .catch(() => undefined);
    }
  }

  // Email for penny + 90%+
  if (EMAIL_TO) {
    try {
      if (isPenny) {
        await sendPennyAlertEmail(EMAIL_TO, toEmailDeal(deal));
        await logAlert(deal.id, "email", "sent");
      } else if (deal.discountPct >= 90) {
        await sendHighDiscountEmail(EMAIL_TO, toEmailDeal(deal));
        await logAlert(deal.id, "email", "sent");
      }
    } catch (err) {
      await logAlert(
        deal.id,
        "email",
        "failed",
        undefined,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  await handleWatchlistMatches(deal);
}

async function handleWatchlistMatches(deal: DealInput): Promise<void> {
  const matches = await prisma.watchlist.findMany({
    where: { upc: deal.product.upc },
  });

  for (const item of matches) {
    if (deal.discountPct < item.minDiscount) continue;
    if (item.targetPrice !== null && deal.currentPrice > item.targetPrice) continue;

    // Push
    if (item.notifyPush) {
      const subs = await prisma.pushSubscription.findMany({ where: { isActive: true } });
      await Promise.allSettled(
        subs.map((s) =>
          sendPushNotification(s, {
            title: `✅ WATCHLIST HIT — $${deal.currentPrice.toFixed(2)}`,
            body: `${deal.product.name} @ ${deal.store.name}`,
            url: `/?deal=${deal.id}`,
            tag: `watchlist-${item.id}`,
          })
        )
      );
      await logAlert(deal.id, "push", "sent", item.id);
    }

    // Email
    if (item.notifyEmail && EMAIL_TO) {
      try {
        await sendWatchlistHitEmail(EMAIL_TO, toEmailDeal(deal), item.targetPrice);
        await logAlert(deal.id, "email", "sent", item.id);
      } catch (err) {
        await logAlert(
          deal.id,
          "email",
          "failed",
          item.id,
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    await prisma.watchlist.update({
      where: { id: item.id },
      data: { lastAlertedAt: new Date() },
    });
  }
}
